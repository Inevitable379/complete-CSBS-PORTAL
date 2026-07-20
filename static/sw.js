/* CSBS Portal service worker — offline-capable, cache-first shell.
   Bump VERSION whenever static assets change to force an update. */
const VERSION = 'v2';
const SHELL_CACHE = `shell-${VERSION}`;
const API_CACHE = `api-${VERSION}`;

const SHELL = [
    '/',
    '/static/css/base.css',
    '/static/css/components.css',
    '/static/js/main.js',
    '/static/favicon.svg',
    '/static/manifest.json'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(k => k !== SHELL_CACHE && k !== API_CACHE).map(k => caches.delete(k))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);
    if (e.request.method !== 'GET' || url.origin !== location.origin) return;

    // Auth endpoints must always hit the network — never cache a session check
    if (url.pathname.startsWith('/api/auth/')) return;

    if (url.pathname.startsWith('/api/')) {
        // Network-first for data; fall back to last good copy when offline
        e.respondWith(
            fetch(e.request).then(res => {
                if (res.ok) {
                    const copy = res.clone();
                    caches.open(API_CACHE).then(c => c.put(e.request, copy));
                }
                return res;
            }).catch(() =>
                caches.match(e.request).then(hit => hit || new Response(
                    JSON.stringify({ error: 'offline' }),
                    { status: 503, headers: { 'Content-Type': 'application/json' } }
                ))
            )
        );
        return;
    }

    // Static shell: stale-while-revalidate — instant paint, silent update
    e.respondWith(
        caches.match(e.request).then(hit => {
            const refresh = fetch(e.request).then(res => {
                if (res.ok) {
                    const copy = res.clone();
                    caches.open(SHELL_CACHE).then(c => c.put(e.request, copy));
                }
                return res;
            }).catch(() => hit);
            return hit || refresh;
        })
    );
});
