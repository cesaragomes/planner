const CACHE_NAME = 'prumo-pwa-v5';
const ASSETS = ['./', './index.html', './manifest.json', './favicon.ico'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Nunca interceptar chamadas externas (Firebase Auth, Firestore Listen/WebChannel, FCM, Google APIs, CDNs)
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Modo 1 & Híbrido: Disparo de Notificações Locais via Service Worker (compatível com Windows, Linux, Android e iOS instalado)
self.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'SHOW_LOCAL_NOTIFICATION') {
    const payload = msg.payload || msg;
    const title = payload.title || 'Prumo — Gestão da Casa e Rotina';
    const options = {
      body: payload.body || 'Você tem lembretes pendentes hoje no Prumo.',
      icon: payload.icon || './favicon.ico',
      badge: payload.badge || './favicon.ico',
      tag: payload.tag || ('prumo-local-' + Date.now()),
      renotify: Boolean(payload.renotify !== false),
      requireInteraction: Boolean(payload.requireInteraction),
      vibrate: payload.vibrate || [200, 100, 200],
      data: Object.assign(
        { url: payload.url || './index.html', source: 'local_sw', timestamp: Date.now() },
        payload.data || {}
      )
    };

    event.waitUntil(
      self.registration.showNotification(title, options).catch(() => {})
    );
  } else if (msg.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Modo 2 & Híbrido: Recebimento de Web Push em Nuvem (Firebase Cloud Messaging - FCM / Push API)
self.addEventListener('push', (event) => {
  let parsed = {};
  if (event.data) {
    try {
      parsed = event.data.json();
    } catch (err) {
      parsed = {
        title: 'Prumo — Alerta da Rotina',
        body: event.data.text()
      };
    }
  }

  const notifBlock = parsed.notification || {};
  const dataBlock = parsed.data || {};
  const fcmOptions = parsed.fcmOptions || {};

  const title =
    notifBlock.title ||
    parsed.title ||
    dataBlock.title ||
    'Prumo — Gestão da Casa e Rotina';

  const body =
    notifBlock.body ||
    parsed.body ||
    dataBlock.body ||
    'Confira seus compromissos, hábitos e contas de hoje no Prumo.';

  const targetUrl =
    fcmOptions.link ||
    notifBlock.click_action ||
    dataBlock.url ||
    parsed.url ||
    './index.html';

  const options = {
    body,
    icon: notifBlock.icon || parsed.icon || './favicon.ico',
    badge: notifBlock.badge || parsed.badge || './favicon.ico',
    tag: notifBlock.tag || parsed.tag || dataBlock.tag || 'prumo-cloud-push',
    renotify: true,
    vibrate: [200, 100, 200],
    data: Object.assign({}, dataBlock, {
      url: targetUrl,
      source: 'cloud_fcm',
      timestamp: Date.now()
    })
  };

  event.waitUntil(
    self.registration.showNotification(title, options).catch(() => {})
  );
});

// Focar janela existente ou abrir o app ao tocar na notificação
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notifData = event.notification.data || {};
  const targetUrl = notifData.url || './';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (
            client.url &&
            client.url.startsWith(self.location.origin) &&
            'focus' in client
          ) {
            client.postMessage({
              type: 'PRUMO_NOTIFICATION_CLICK',
              data: notifData
            });
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
      .catch(() => {})
  );
});
