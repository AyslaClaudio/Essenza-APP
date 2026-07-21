const CACHE_VERSION = 'essenza-v3';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const MENU_CACHE = `${CACHE_VERSION}-menu`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.png',
  '/logo-192.png',
  '/logo-512.png',
  '/favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Cache-First: static assets and product images
function cacheFirst(request, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          cache.put(request, response.clone());
        }
        return response;
      }).catch(() => cached);
    })
  );
}

// Stale-While-Revalidate: navigations and API routes
function staleWhileRevalidate(request, cacheName = RUNTIME_CACHE) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        if (response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
}

// Tabelas públicas de leitura (cardápio/config) que ficam em cache para o app
// abrir e mostrar o último cardápio salvo mesmo sem internet. NÃO inclui
// tabelas do painel administrativo (pedidos, clientes, financeiro) — essas
// exigem sempre a rede, tanto por segurança quanto para não mostrar dado
// desatualizado numa tela de gestão.
const SUPABASE_CACHEABLE_TABLES = ['produtos', 'adicionais', 'taxa_entrega', 'configuracoes', 'categorias'];

function isCacheableSupabaseRead(url) {
  if (!url.hostname.includes('supabase.co')) return false;
  if (!url.pathname.startsWith('/rest/v1/')) return false;
  const table = url.pathname.split('/').pop();
  return SUPABASE_CACHEABLE_TABLES.includes(table);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // Cardápio/config: Stale-While-Revalidate num cache próprio, para o cliente
  // e o balcão ainda mostrarem o cardápio mesmo com a internet fora do ar.
  if (isCacheableSupabaseRead(url)) {
    event.respondWith(staleWhileRevalidate(request, MENU_CACHE));
    return;
  }

  // Demais chamadas ao Supabase (pedidos, clientes, financeiro, auth, IA
  // etc.) sempre vão para a rede — dado de gestão não pode ficar desatualizado
  // nem em cache.
  if (url.hostname.includes('supabase.co')) {
    return;
  }

  // Navigation requests: Stale-While-Revalidate
  if (request.mode === 'navigate') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Product images (jpg, png, webp, gif, svg): Cache-First in image cache
  if (request.destination === 'image' || /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE));
    return;
  }

  // Static assets (JS, CSS, fonts): Cache-First in static cache
  if (request.destination === 'style' || request.destination === 'script' || request.destination === 'font') {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Default: Stale-While-Revalidate
  event.respondWith(staleWhileRevalidate(request));
});
