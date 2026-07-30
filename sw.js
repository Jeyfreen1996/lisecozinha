const CACHE_NAME = 'lise-cozinha-v3';
const ASSETS = [
    '/',
    '/index.html',
    '/cardapio/index.html',
    '/pedidos/index.html',
    '/avaliacoes/index.html',
    '/perfil/index.html',
    '/assets/js/app.js',
    '/assets/js/supabase.js',
    '/manifest.json',
    '/assets/img/icon-192.png',
    '/assets/img/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                // Cache each asset individually, ignoring failures
                return Promise.allSettled(ASSETS.map(url => cache.add(url)));
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    // Don't cache Supabase, CDN fonts, or external resources
    if (event.request.url.includes('supabase.co')) return;
    if (event.request.url.includes('fonts.googleapis.com')) return;
    if (event.request.url.includes('fonts.gstatic.com')) return;
    if (event.request.url.includes('cdn.tailwindcss.com')) return;
    if (event.request.url.includes('cdn.jsdelivr.net')) return;
    if (event.request.url.includes('mapbox.com')) return;

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // Return cached version immediately, fetch update in background
                if (cachedResponse) {
                    fetch(event.request).then(response => {
                        if (response && response.status === 200) {
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(event.request, response);
                            });
                        }
                    }).catch(() => {});
                    return cachedResponse;
                }
                // Not in cache, fetch from network
                return fetch(event.request).then(response => {
                    if (response && response.status === 200 && response.type === 'basic') {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return response;
                });
            }).catch(() => {
                // Offline fallback
                if (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')) {
                    return caches.match('/index.html');
                }
            })
    );
});
