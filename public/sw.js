/* Service Worker Oficial — EMEB Joaquim Candelário de Freitas (PWA Offline & Web Push) */
const SW_VERSION = 'candelario-pwa-v6';
const CACHE_NAME = 'candelario-offline-v6';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './brasao-jundiai.svg',
  './favicon.ico',
  './favicon.svg',
  './favicon-32x32.png',
  './favicon-16x16.png',
  './apple-touch-icon.png',
  './pwa-192x192.png',
  './pwa-512x512.png',
];

/* ==========================================================================
   INDEXEDDB BLOB STORAGE PARA FOTOS DE ESTUDANTES
   Isola o armazenamento de fotos binárias pesadas fora do Cache Storage API,
   evitando esgotamento de cota do navegador e acelerando o acesso offline.
   ========================================================================== */
const PHOTO_IDB_NAME = 'candelario_student_photos_db_v1';
const PHOTO_IDB_VERSION = 1;
const PHOTO_STORE_NAME = 'student_photos';

let photoDbPromise = null;

function getPhotoDb() {
  if (photoDbPromise) return photoDbPromise;

  photoDbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB não suportado'));
    }
    const openReq = indexedDB.open(PHOTO_IDB_NAME, PHOTO_IDB_VERSION);

    openReq.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE_NAME)) {
        const store = db.createObjectStore(PHOTO_STORE_NAME, { keyPath: 'url' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };

    openReq.onsuccess = (event) => {
      const db = event.target.result;
      db.onclose = () => { photoDbPromise = null; };
      db.onversionchange = () => {
        try { db.close(); } catch (_) {}
        photoDbPromise = null;
      };
      resolve(db);
    };

    openReq.onerror = (event) => {
      photoDbPromise = null;
      reject(event.target.error || new Error('Falha ao abrir IndexedDB de fotos'));
    };
  });

  return photoDbPromise;
}

/**
 * Normaliza e gera chaves de busca para garantir compatibilidade entre
 * proxy local (/api/drive-photo/ID), thumbnails do Drive e URLs completas.
 */
function getPhotoLookupKeys(url) {
  const keys = [url.href];
  if (url.pathname && url.pathname !== url.href) {
    keys.push(url.pathname);
  }
  // Extrai ID do Google Drive de /api/drive-photo/:id
  const proxyMatch = url.pathname.match(/\/api\/drive-photo\/([a-zA-Z0-9-_]+)/);
  if (proxyMatch && proxyMatch[1]) {
    keys.push(`drive:${proxyMatch[1]}`);
    keys.push(`/api/drive-photo/${proxyMatch[1]}`);
  }
  // Extrai ID de parâmetro ?id= (thumbnails)
  const idParam = url.searchParams.get('id');
  if (idParam) {
    keys.push(`drive:${idParam}`);
  }
  // Extrai ID de lh3.googleusercontent.com/d/:id
  const ucMatch = url.pathname.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (ucMatch && ucMatch[1]) {
    keys.push(`drive:${ucMatch[1]}`);
  }
  return Array.from(new Set(keys));
}

async function getPhotoFromIndexedDB(key) {
  try {
    const db = await getPhotoDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(PHOTO_STORE_NAME, 'readonly');
      const store = tx.objectStore(PHOTO_STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (_) {
    return null;
  }
}

async function findCachedPhoto(url) {
  const keys = getPhotoLookupKeys(url);
  for (const k of keys) {
    const found = await getPhotoFromIndexedDB(k);
    if (found && found.blob) {
      return found;
    }
  }
  return null;
}

async function savePhotoBlobToIndexedDB(urlKey, blob, contentType) {
  if (!blob || blob.size === 0) return false;
  try {
    const db = await getPhotoDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE_NAME, 'readwrite');
      const store = tx.objectStore(PHOTO_STORE_NAME);
      const record = {
        url: urlKey,
        blob: blob,
        contentType: contentType || blob.type || 'image/jpeg',
        size: blob.size,
        updatedAt: Date.now(),
      };
      const req = store.put(record);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Aviso: falha ao persistir foto no IndexedDB:', err);
    return false;
  }
}

async function storePhotoBlobInAllKeys(url, blob, contentType) {
  const keys = getPhotoLookupKeys(url);
  for (const k of keys) {
    await savePhotoBlobToIndexedDB(k, blob, contentType);
  }
}

async function clearPhotosIndexedDB() {
  try {
    const db = await getPhotoDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(PHOTO_STORE_NAME, 'readwrite');
      const store = tx.objectStore(PHOTO_STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (_) {
    return false;
  }
}

function isStudentPhotoRequest(url, request) {
  if (request.method !== 'GET') return false;

  const pathname = url.pathname;
  const hostname = url.hostname;

  // 1. Endpoints do backend de fotos de estudantes e proxy do Google Drive
  if (pathname.startsWith('/api/photos/') || pathname.startsWith('/api/drive-photo/')) {
    return true;
  }

  // 2. Google Drive Thumbnails e visualização direta de fotos
  if (
    hostname.includes('drive.google.com') &&
    (pathname.includes('/thumbnail') || pathname.includes('/uc'))
  ) {
    return true;
  }

  // 3. Google User Content (lh3.googleusercontent.com/d/...)
  if (hostname.includes('googleusercontent.com') && pathname.includes('/d/')) {
    return true;
  }

  // 4. Imagens com parâmetros ou caminhos explícitos de identificação estudantil
  if (
    request.destination === 'image' &&
    (pathname.includes('/student-photos/') ||
      pathname.includes('/fotos-estudantes/') ||
      url.searchParams.has('studentPhoto'))
  ) {
    return true;
  }

  return false;
}

function createOfflineAvatarSvgResponse() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
    <rect width="100" height="100" fill="#f1f5f9"/>
    <circle cx="50" cy="38" r="20" fill="#cbd5e1"/>
    <path d="M18 90c0-17.673 14.327-32 32-32s32 14.327 32 32z" fill="#cbd5e1"/>
  </svg>`;
  return new Response(svg, {
    status: 200,
    statusText: 'OK',
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'X-Cache-Fallback': 'Offline-Avatar-SVG',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Estratégia de Cache para Fotos de Estudantes:
 * 1. Cache-First inteligente via IndexedDB (resposta em <5ms a partir de Blob binário)
 * 2. Revalidação assíncrona em segundo plano quando online (Stale-While-Revalidate)
 * 3. Fallback gracioso offline com avatar SVG neutro caso a imagem nunca tenha sido baixada
 */
async function handlePhotoRequest(event, req, url) {
  // Tenta recuperar do IndexedDB
  try {
    const cached = await findCachedPhoto(url);
    if (cached && cached.blob) {
      // Revalida em segundo plano se houver conexão ativa
      if (typeof self.navigator !== 'undefined' && self.navigator.onLine !== false) {
        fetch(req)
          .then(async (netRes) => {
            if (netRes && (netRes.status === 200 || netRes.type === 'opaque')) {
              try {
                const clone = netRes.clone();
                const ct = clone.headers.get('content-type') || cached.contentType;
                const blob = await clone.blob();
                if (blob && blob.size > 0) {
                  await storePhotoBlobInAllKeys(url, blob, ct);
                }
              } catch (_) {}
            }
          })
          .catch(() => {});
      }

      return new Response(cached.blob, {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': cached.contentType || 'image/jpeg',
          'X-Cache-Provider': 'IndexedDB-BlobStore',
          'X-Cache-Hit': 'true',
          'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
        },
      });
    }
  } catch (err) {
    console.warn('Aviso: falha na leitura do IndexedDB de fotos:', err);
  }

  // Se não estiver no IndexedDB, busca na rede e persiste
  try {
    const networkRes = await fetch(req);
    if (networkRes && (networkRes.status === 200 || networkRes.type === 'opaque')) {
      try {
        const clone = networkRes.clone();
        const contentType = clone.headers.get('content-type') || 'image/jpeg';
        const blob = await clone.blob();
        if (blob && blob.size > 0) {
          storePhotoBlobInAllKeys(url, blob, contentType).catch(() => {});
        }
      } catch (_) {
        // Respostas opacas podem impedir clonagem de blob em alguns navegadores
      }
    }
    return networkRes;
  } catch (netErr) {
    // Modo Offline: tenta recuperação de emergência no IDB antes do fallback SVG
    try {
      const fallbackCached = await findCachedPhoto(url);
      if (fallbackCached && fallbackCached.blob) {
        return new Response(fallbackCached.blob, {
          status: 200,
          statusText: 'OK',
          headers: {
            'Content-Type': fallbackCached.contentType || 'image/jpeg',
            'X-Cache-Provider': 'IndexedDB-BlobStore',
            'X-Cache-Offline': 'true',
          },
        });
      }
    } catch (_) {}

    return createOfflineAvatarSvgResponse();
  }
}

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
 * Estratégia de Roteamento de Requisições:
 * - Fotos de estudantes (/api/photos/, /api/drive-photo/, thumbnails): IndexedDB Blob Cache
 * - Demais APIs dinâmicas (/api/), Firebase, Google APIs: Rede direta (sem cache)
 * - Navegações HTML: Network First com fallback para index.html em cache
 * - Assets estáticos (JS, CSS, imagens de UI, fontes): Stale-While-Revalidate
 */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Aceita apenas requisições GET
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1. Interceptação prioritária de Fotos de Estudantes via IndexedDB
  if (isStudentPhotoRequest(url, req)) {
    event.respondWith(handlePhotoRequest(event, req, url));
    return;
  }

  // 2. Ignora APIs dinâmicas, WebSocket, extensões de navegador e autenticação
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

  // 3. Requisições de navegação (páginas HTML)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          const ct = (networkRes.headers.get('content-type') || '').toLowerCase();
          if (networkRes && networkRes.status === 200 && ct.includes('text/html')) {
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
            (await caches.match('./'));
          if (fallback) return fallback;
          return new Response('Modo Offline — Lista Piloto Candelário 2027', {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          });
        })
    );
    return;
  }

  // 4. Assets estáticos da mesma origem (JS, CSS, imagens, fontes)
  if (url.origin === self.location.origin) {
    const isImmutableStaticAsset =
      url.pathname.includes('/assets/') ||
      /\.(svg|png|ico|woff2?|jpg|jpeg|webp)$/i.test(url.pathname);

    event.respondWith(
      caches.match(req).then((cachedRes) => {
        if (cachedRes) {
          // Bundles Vite com hash e ícones/brasão: Cache-First puro (zero requisições extras que geram Rate Limit no GitHub Pages)
          if (isImmutableStaticAsset) {
            return cachedRes;
          }
          // Demais arquivos (ex: manifest.json): Stale-While-Revalidate
          fetch(req)
            .then((networkRes) => {
              const ct = (networkRes.headers.get('content-type') || '').toLowerCase();
              if (networkRes && networkRes.status === 200 && !ct.includes('text/html')) {
                caches.open(CACHE_NAME).then((cache) => cache.put(req, networkRes));
              }
            })
            .catch(() => {});
          return cachedRes;
        }

        return fetch(req)
          .then((networkRes) => {
            const ct = (networkRes.headers.get('content-type') || '').toLowerCase();
            // Nunca armazena páginas HTML 404/Rate-Limit como se fossem JS, CSS ou imagens
            if (networkRes && networkRes.status === 200 && !ct.includes('text/html')) {
              const clone = networkRes.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            }
            return networkRes;
          })
          .catch(() => {
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
    icon: './pwa-192x192.png',
    badge: './favicon-32x32.png',
    tag: 'candelario-fcm-' + Date.now(),
    requireInteraction: false,
    data: {
      targetScreen: 'frequencia_mensal',
      category: 'prazo',
      urgency: 'warning',
      url: './?screen=frequencia_mensal',
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
        `./?screen=${encodeURIComponent(targetScreen)}${
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
    icon: payload.icon || './pwa-192x192.png',
    badge: payload.badge || './favicon-32x32.png',
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

  if (msg.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // Limpa o cache IndexedDB de fotos quando o administrador solicita reset de fotos
  if (msg.type === 'CLEAR_STUDENT_PHOTOS_CACHE') {
    event.waitUntil(clearPhotosIndexedDB());
    return;
  }

  // Permite que o cliente armazene diretamente um Blob de foto no IndexedDB
  if (msg.type === 'CACHE_STUDENT_PHOTO_BLOB' && msg.url && msg.blob) {
    try {
      const parsedUrl = new URL(msg.url, self.location.origin);
      event.waitUntil(storePhotoBlobInAllKeys(parsedUrl, msg.blob, msg.contentType));
    } catch (_) {}
    return;
  }

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
      icon: './pwa-192x192.png',
      badge: './favicon-32x32.png',
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
        url: `./?screen=${encodeURIComponent(resolvedScreen)}${classQuery}`,
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
            notifData.url || `./?screen=${encodeURIComponent(targetScreen)}${classQuery}`;
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
