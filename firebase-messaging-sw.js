/* ============================================================
   Service Worker unico del sitio (CTQ Escalerilla)
   - Notificaciones push (Firebase Cloud Messaging)
   - Modo offline / carga rapida (cache del "app shell")
   Un solo SW por scope: por eso ambas funciones viven en este archivo
   (registrar un segundo SW en la misma raiz reemplazaria a este).
   ============================================================ */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyA237FUvmXmEXDuhs7Mz2cO1TV6kmEsqo0",
  authDomain: "chat-app-accc3.firebaseapp.com",
  projectId: "chat-app-accc3",
  storageBucket: "chat-app-accc3.firebasestorage.app",
  messagingSenderId: "240530471180",
  appId: "1:240530471180:web:58db290f9ce9b430f6b129"
});

const messaging = firebase.messaging();

/* ---------------------------- PUSH ---------------------------- */
const ICONO = new URL('icon-192.png', self.registration.scope).href;

// Si el mensaje trae "notification", el SDK de Firebase ya la muestra solo;
// volver a mostrarla aqui la duplicaria. Solo se arma a mano cuando llega
// como mensaje de datos (sin "notification").
messaging.onBackgroundMessage(function (payload) {
  if (payload.notification) return;
  const d = payload.data || {};
  return self.registration.showNotification(d.title || 'Club Tenis Estadio Quilicura', {
    body: d.body || '¡Hay novedades en el ranking/escalerilla!',
    icon: ICONO,
    badge: ICONO,
    tag: d.tag || 'ctq-novedades',
    data: { url: d.url || self.registration.scope }
  });
});

// Al tocar la notificacion: enfoca la app si ya esta abierta, o la abre.
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) ||
    (event.notification.data && event.notification.data.FCM_MSG && event.notification.data.FCM_MSG.data && event.notification.data.FCM_MSG.data.url) ||
    self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (lista) {
      for (const c of lista) {
        if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(destino);
    })
  );
});

/* ---------------------------- OFFLINE ---------------------------- */
// Subir la version invalida todo el cache anterior en el siguiente "activate".
const VERSION = 'ctq-v1';
const CACHE_SHELL = VERSION + '-shell';
const CACHE_RUNTIME = VERSION + '-runtime';
const MAX_RUNTIME = 80;

// Archivos que se guardan al instalar. Si alguno no existe no se rompe la instalacion.
const SHELL = [
  './', 'index.html', 'manifest.json', 'match-result-card.js',
  'icon-192.png', 'icon-512.png', 'icon-512-maskable.png', 'apple-touch-icon.png', 'logo-club-tenis-estadio-quilicura.jpg',
  'lib/supabase.min.js/supabase.min.js'
];

// Hosts de datos en vivo: NUNCA se interceptan ni se cachean.
const NO_CACHEAR = [
  '.supabase.co', 'firestore.googleapis.com', 'firebaseinstallations.googleapis.com',
  'fcmregistrations.googleapis.com', 'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com', 'accounts.google.com', 'drive.google.com',
  'youtube.com', 'youtube-nocookie.com', 'googlevideo.com'
];
// Librerias/estilos de terceros que si conviene guardar.
const TERCEROS_OK = [
  'www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com',
  'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_SHELL).then(function (cache) {
      return Promise.allSettled(SHELL.map(function (u) { return cache.add(u); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (claves) {
      return Promise.all(claves.filter(function (k) {
        return k.indexOf('ctq-') === 0 && k !== CACHE_SHELL && k !== CACHE_RUNTIME;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function recortar(nombre, max) {
  return caches.open(nombre).then(function (c) {
    return c.keys().then(function (ks) {
      if (ks.length <= max) return;
      return c.delete(ks[0]).then(function () { return recortar(nombre, max); });
    });
  });
}

// Estatico: responde del cache al instante y actualiza en segundo plano.
function staleWhileRevalidate(req) {
  return caches.match(req).then(function (hit) {
    const red = fetch(req).then(function (resp) {
      if (resp && (resp.ok || resp.type === 'opaque')) {
        const copia = resp.clone();
        caches.open(CACHE_RUNTIME).then(function (c) { return c.put(req, copia); }).then(function () { return recortar(CACHE_RUNTIME, MAX_RUNTIME); });
      }
      return resp;
    }).catch(function () { return hit || Response.error(); });
    return hit || red;
  });
}

// Paginas: primero la red (siempre la version nueva), con respaldo en cache
// si no hay conexion o tarda mas de 4 s.
function networkFirstNavegacion(req) {
  return new Promise(function (resolve) {
    let resuelto = false;
    const respaldo = function () {
      return caches.match(req).then(function (h) { return h || caches.match('./'); }).then(function (h) { return h || caches.match('index.html'); });
    };
    const t = setTimeout(function () {
      respaldo().then(function (h) { if (h && !resuelto) { resuelto = true; resolve(h); } });
    }, 4000);
    fetch(req).then(function (resp) {
      clearTimeout(t);
      if (resp && resp.ok) {
        const copia = resp.clone();
        caches.open(CACHE_SHELL).then(function (c) { c.put(req, copia); });
      }
      if (!resuelto) { resuelto = true; resolve(resp); }
    }).catch(function () {
      clearTimeout(t);
      respaldo().then(function (h) { if (!resuelto) { resuelto = true; resolve(h || Response.error()); } });
    });
  });
}

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (NO_CACHEAR.some(function (h) { return url.hostname === h || url.hostname.endsWith(h.charAt(0) === '.' ? h : '.' + h); })) return;
  // El propio SW y las peticiones con Range (video) no se tocan.
  if (url.pathname.endsWith('firebase-messaging-sw.js') || req.headers.has('range')) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirstNavegacion(req));
    return;
  }
  if (url.origin === self.location.origin || TERCEROS_OK.indexOf(url.hostname) !== -1) {
    event.respondWith(staleWhileRevalidate(req));
  }
});
