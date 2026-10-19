const CACHE_NAME = 'prumo-pwa-v4';
const SCHEDULE_CACHE_NAME = 'prumo-notif-schedule-v1';
const SCHEDULE_CACHE_URL = '/__prumo_notif_schedule__.json';
const ASSETS = ['./', './index.html', './manifest.json', './favicon.ico'];

let swDelayedTestTimer = null;

function getLocalTodayStrSW() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getLocalHHMMSW() {
  const now = new Date();
  return String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
}

async function loadScheduleFromCacheSW() {
  try {
    const cache = await caches.open(SCHEDULE_CACHE_NAME);
    const resp = await cache.match(SCHEDULE_CACHE_URL);
    if (!resp) return null;
    return await resp.json();
  } catch (e) {
    return null;
  }
}

async function saveScheduleToCacheSW(scheduleObj) {
  try {
    const cache = await caches.open(SCHEDULE_CACHE_NAME);
    const body = JSON.stringify(scheduleObj || {});
    await cache.put(
      SCHEDULE_CACHE_URL,
      new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      })
    );
  } catch (e) {}
}

async function notifyClientsDispatchedKeySW(logKey) {
  try {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (let i = 0; i < clientList.length; i++) {
      clientList[i].postMessage({
        type: 'PRUMO_SW_DISPATCHED_LOG',
        logKey
      });
    }
  } catch (e) {}
}

async function registerOsTimestampTriggersSW(scheduleObj) {
  try {
    if (!scheduleObj || scheduleObj.mode === 'disabled') return;
    if (typeof Notification === 'undefined' || !('showTrigger' in Notification.prototype) || typeof TimestampTrigger === 'undefined') {
      return;
    }
    const items = Array.isArray(scheduleObj.upcomingTriggers) ? scheduleObj.upcomingTriggers : [];
    const nowMs = Date.now();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it || !it.timestampMs || it.timestampMs <= nowMs) continue;
      if (scheduleObj.dispatchedLog && scheduleObj.dispatchedLog[it.logKey]) continue;
      await self.registration.showNotification(it.title, {
        body: it.body,
        icon: './favicon.ico',
        badge: './favicon.ico',
        tag: it.logKey,
        showTrigger: new TimestampTrigger(it.timestampMs),
        data: Object.assign({ url: './index.html', source: 'os_trigger' }, it.data || {})
      }).catch(() => {});
    }
  } catch (e) {}
}

async function checkAndFireDueNotificationsInSW() {
  try {
    const sched = await loadScheduleFromCacheSW();
    if (!sched || sched.mode === 'disabled') return;

    const todayKey = getLocalTodayStrSW();
    const hhmm = getLocalHHMMSW();
    if (!sched.dispatchedLog || typeof sched.dispatchedLog !== 'object') {
      sched.dispatchedLog = {};
    }

    let cacheMutated = false;

    // 1. Teste agendado de 1 minuto (se existir e já venceu)
    if (sched.scheduledTest && sched.scheduledTest.fireAtMs && Date.now() >= sched.scheduledTest.fireAtMs) {
      const testObj = sched.scheduledTest;
      delete sched.scheduledTest;
      cacheMutated = true;
      await self.registration.showNotification(
        testObj.title || '⏱️ Teste Automático Agendado — Prumo',
        {
          body: testObj.body || 'O disparo automático em segundo plano funcionou!',
          icon: './favicon.ico',
          badge: './favicon.ico',
          tag: testObj.tag || ('prumo-sched-test-' + Date.now()),
          renotify: true,
          vibrate: [200, 100, 200],
          data: { url: './index.html', targetModule: 'mod1_plans', source: 'sw_scheduled_test' }
        }
      ).catch(() => {});
    }

    // Só processa os itens do dia se o snapshot pertencer à data local de hoje
    if (sched.todayKey === todayKey && Array.isArray(sched.items)) {
      for (let i = 0; i < sched.items.length; i++) {
        const item = sched.items[i];
        if (!item || !item.enabled || !item.logKey) continue;
        if (sched.dispatchedLog[item.logKey]) continue;

        const afterStart = hhmm >= item.time;
        const beforeEnd = !item.windowEnd || hhmm < item.windowEnd;
        if (afterStart && beforeEnd) {
          sched.dispatchedLog[item.logKey] = true;
          cacheMutated = true;
          await self.registration.showNotification(item.title, {
            body: item.body,
            icon: './favicon.ico',
            badge: './favicon.ico',
            tag: item.logKey,
            renotify: true,
            vibrate: [200, 100, 200],
            data: Object.assign({ url: './index.html', source: 'sw_auto_scheduler' }, item.data || {})
          }).catch(() => {});
          await notifyClientsDispatchedKeySW(item.logKey);
        }
      }
    }

    if (cacheMutated) {
      await saveScheduleToCacheSW(sched);
    }
  } catch (e) {}
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== SCHEDULE_CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
     .then(() => checkAndFireDueNotificationsInSW())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Nunca interceptar chamadas externas (Firebase Auth, Firestore Listen/WebChannel, FCM, Google APIs, CDNs)
  if (url.origin !== self.location.origin) return;

  // Aproveita qualquer atividade de rede do Service Worker para verificar se há notificações vencidas
  event.waitUntil(checkAndFireDueNotificationsInSW());

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

// Background Sync & Periodic Background Sync (Android Chrome / Desktop PWA)
self.addEventListener('sync', (event) => {
  if (event.tag === 'prumo-notif-sync' || event.tag.startsWith('prumo-')) {
    event.waitUntil(checkAndFireDueNotificationsInSW());
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'prumo-notif-periodic' || event.tag.startsWith('prumo-')) {
    event.waitUntil(checkAndFireDueNotificationsInSW());
  }
});

// Modo 1 & Híbrido: Disparo e Sincronização de Agenda de Notificações Locais via Service Worker
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
  } else if (msg.type === 'SYNC_NOTIFICATION_SCHEDULE') {
    const schedulePayload = msg.schedulePayload || {};
    event.waitUntil(
      saveScheduleToCacheSW(schedulePayload)
        .then(() => registerOsTimestampTriggersSW(schedulePayload))
        .then(() => checkAndFireDueNotificationsInSW())
    );
  } else if (msg.type === 'SCHEDULE_DELAYED_NOTIFICATION') {
    const delayMs = Math.max(1000, Number(msg.delayMs) || 60000);
    const title = msg.title || '⏱️ Teste de Agendamento Automático — Prumo';
    const body = msg.body || 'Notificação automática disparada pelo Service Worker no horário programado!';
    const tag = msg.tag || ('prumo-delayed-test-' + Date.now());

    event.waitUntil(
      (async () => {
        const sched = (await loadScheduleFromCacheSW()) || {};
        sched.scheduledTest = {
          fireAtMs: Date.now() + delayMs,
          title,
          body,
          tag
        };
        await saveScheduleToCacheSW(sched);

        if (swDelayedTestTimer) clearTimeout(swDelayedTestTimer);
        swDelayedTestTimer = setTimeout(() => {
          checkAndFireDueNotificationsInSW();
        }, delayMs + 250);

        await new Promise((resolve) => setTimeout(resolve, delayMs));
        await checkAndFireDueNotificationsInSW();
      })()
    );
  } else if (msg.type === 'CHECK_DUE_NOTIFICATIONS') {
    event.waitUntil(checkAndFireDueNotificationsInSW());
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

// Verificação periódica enquanto a thread do Service Worker estiver ativa
setInterval(() => {
  checkAndFireDueNotificationsInSW();
}, 25000);
