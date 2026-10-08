/* Service Worker Oficial — EMEB Joaquim Candelário de Freitas (Push & Avisos de Prazos) */
const SW_VERSION = 'candelario-push-sw-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Escuta eventos Web Push nativos enviados por servidor VAPID / Background Push
 */
self.addEventListener('push', (event) => {
  let payload = {
    title: 'EMEB Candelário de Freitas',
    body: 'Novo aviso pedagógico ou prazo próximo de frequência.',
    icon: '/brasao-jundiai.svg',
    badge: '/brasao-jundiai.svg',
    tag: 'candelario-push-' + Date.now(),
    data: {
      targetScreen: 'frequencia_mensal',
      url: '/',
    },
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = {
        ...payload,
        ...parsed,
        data: {
          ...payload.data,
          ...(parsed.data || {}),
        },
      };
    } catch {
      payload.body = event.data.text() || payload.body;
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/brasao-jundiai.svg',
    badge: payload.badge || '/brasao-jundiai.svg',
    tag: payload.tag,
    renotify: true,
    vibrate: [120, 60, 120],
    data: payload.data,
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

/**
 * Escuta mensagens diretas da aplicação cliente para disparar notificações nativas
 * via Service Worker (ex: alertas de prazo de fechamento, novos avisos da coordenação
 * ou retornos da secretaria em Faltas Seguidas).
 */
self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'SHOW_PUSH_NOTIFICATION' && msg.notification) {
    const { title, body, tag, targetScreen, category } = msg.notification;
    const options = {
      body: body || '',
      icon: '/brasao-jundiai.svg',
      badge: '/brasao-jundiai.svg',
      tag: tag || 'candelario-notice-' + Date.now(),
      renotify: true,
      vibrate: [100, 50, 100],
      data: {
        targetScreen: targetScreen || 'turmas',
        category: category || 'aviso',
        url: '/',
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
 * Ao clicar na notificação Push do sistema operacional, foca a janela do app
 * e navega diretamente para a tela correspondente ao aviso/prazo.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetScreen =
    (event.notification.data && event.notification.data.targetScreen) || 'turmas';

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
            });
            return;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow('/');
        }
      })
  );
});
