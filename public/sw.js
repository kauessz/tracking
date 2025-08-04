// Define um nome e versão para o cache
const CACHE_NAME = 'rastreamento-mercosul-v1';

// Lista de ficheiros essenciais para a aplicação funcionar offline
const urlsToCache = [
  '/',
  '/index.html',
  '/admin.html',
  '/portal.html',
  '/register.html',
  '/css/style.css',
  '/js/admin.js',
  '/js/script.js',
  '/js/portal.js',
  '/js/register.js',
  '/js/ui.js',
  '/js/utils.js',
  '/js/chart.js',
  '/images/icons/icon-192x192.png',
  '/images/icons/icon-512x512.png',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/choices.js/public/assets/scripts/choices.min.js',
  'https://cdn.jsdelivr.net/npm/choices.js/public/assets/styles/choices.min.css'
];

// Evento de Instalação: Guarda os ficheiros em cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto');
        return cache.addAll(urlsToCache);
      })
  );
});

// Evento de Fetch: Interceta os pedidos à rede
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Se o recurso estiver em cache, retorna-o
        if (response) {
          return response;
        }
        // Caso contrário, busca na rede
        return fetch(event.request);
      }
    )
  );
});
