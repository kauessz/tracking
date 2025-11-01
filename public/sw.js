/**
 * sw-fixed.js - Service Worker Corrigido para PWA
 * Estratégia: Network First com fallback para Cache
 * Cache dinâmico para assets estáticos
 */

const CACHE_NAME = 'mercosul-rastreamento-v2';
const RUNTIME_CACHE = 'mercosul-runtime-v2';

// Assets essenciais para funcionamento offline
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/portal.html',
  '/portal-enhanced.html',
  '/register.html',
  '/css/style.css',
  '/manifest.json'
];

// Assets que podem ser cacheados dinamicamente
const DYNAMIC_CACHE_PATTERNS = [
  /\.js$/,
  /\.css$/,
  /\.woff2?$/,
  /\.png$/,
  /\.jpg$/,
  /\.jpeg$/,
  /\.svg$/,
  /\.webp$/
];

// URLs que NÃO devem ser cacheadas
const SKIP_CACHE_PATTERNS = [
  /firebase/,
  /firestore/,
  /googleapis/,
  /gstatic\.com\/firebasejs/
];

/**
 * Instalação - Pre-cache de assets essenciais
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando service worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Cache aberto, adicionando assets essenciais');
        // Adiciona assets um por um para não falhar tudo se um falhar
        return Promise.allSettled(
          CORE_ASSETS.map(url => 
            cache.add(url).catch(err => {
              console.warn(`[SW] Falha ao cachear ${url}:`, err);
            })
          )
        );
      })
      .then(() => {
        console.log('[SW] Instalação completa');
        return self.skipWaiting(); // Ativa imediatamente
      })
  );
});

/**
 * Ativação - Limpeza de caches antigos
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando service worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              return name !== CACHE_NAME && name !== RUNTIME_CACHE;
            })
            .map((name) => {
              console.log('[SW] Removendo cache antigo:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Ativação completa');
        return self.clients.claim(); // Controla todas as páginas imediatamente
      })
  );
});

/**
 * Verifica se URL deve pular cache
 */
function shouldSkipCache(url) {
  return SKIP_CACHE_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Verifica se URL deve ser cacheada dinamicamente
 */
function shouldDynamicCache(url) {
  return DYNAMIC_CACHE_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Estratégia: Network First com fallback para Cache
 * Ideal para conteúdo dinâmico que muda frequentemente
 */
async function networkFirstStrategy(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  
  try {
    // Tenta buscar da rede primeiro
    const networkResponse = await fetch(request, {
      cache: 'no-cache' // Força busca fresca
    });
    
    // Se sucesso e deve cachear, salva no cache
    if (networkResponse.ok && shouldDynamicCache(request.url)) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
    
  } catch (error) {
    // Se rede falhar, tenta buscar do cache
    console.log('[SW] Rede falhou, buscando do cache:', request.url);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Se não tem no cache e é navegação, retorna página offline
    if (request.mode === 'navigate') {
      const offlineResponse = await cache.match('/index.html');
      if (offlineResponse) return offlineResponse;
    }
    
    throw error;
  }
}

/**
 * Fetch - Intercepta requisições
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignora requisições que não são GET
  if (request.method !== 'GET') {
    return;
  }
  
  // Ignora URLs que devem pular cache (Firebase, etc)
  if (shouldSkipCache(request.url)) {
    return;
  }
  
  // Aplica estratégia Network First
  event.respondWith(networkFirstStrategy(request));
});

/**
 * Message - Comunicação com a aplicação
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => caches.delete(name))
        );
      }).then(() => {
        console.log('[SW] Cache limpo');
      })
    );
  }
});

/**
 * Push - Notificações push (futuro)
 */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body || 'Nova atualização disponível',
    icon: '/images/icons/icon-192x192.png',
    badge: '/images/icons/icon-192x192.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: data.key || '1'
    },
    actions: [
      {
        action: 'explore',
        title: 'Ver Detalhes'
      },
      {
        action: 'close',
        title: 'Fechar'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Mercosul Line', options)
  );
});

/**
 * Notification Click - Ação ao clicar na notificação
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

console.log('[SW] Service Worker carregado');