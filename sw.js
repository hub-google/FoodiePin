const CACHE_NAME = 'foodiepin-v202604201241';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/js/app.js',
    '/manifest.json',
    '/assets/icon-192.png',
    '/assets/icon-512.png'
];

/**
 * INSTALL Event: Cache assets immediately
 */
self.addEventListener('install', event => {
    self.skipWaiting(); // Immediate activation
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('SW: Pre-caching assets');
            return cache.addAll(ASSETS);
        })
    );
});

/**
 * ACTIVATE Event: Cleanup old caches
 */
self.addEventListener('activate', event => {
    event.waitUntil(
        Promise.all([
            clients.claim(), // Take control of all clients
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cache => {
                        if (cache !== CACHE_NAME) {
                            console.log('SW: Clearing old cache', cache);
                            return caches.delete(cache);
                        }
                    })
                );
            })
        ])
    );
});

/**
 * FETCH Event: Network-First for HTML, Cache-First for Assets
 */
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    
    // 1. Network-First Strategy for HTML/UI (Ensures mobile gets updates)
    if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // 2. Cache-First Strategy for Static Assets (already cache-busted by ?v=)
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request).then(fetchResponse => {
                return caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, fetchResponse.clone());
                    return fetchResponse;
                });
            });
        })
    );
});
