// Keeps the static site's files on the device, so the game's data only downloads once.
// Registered by the page as sw.js?build=<id> (the id comes from config.json). Each build
// gets its own cache and older ones are deleted, so files from different builds never
// mix: the disk chunks and the snapshot must match.
//
// The page and config.json always come from the network, so a new build is picked up;
// everything else is served from the cache when it's there.
const BUILD = new URL(self.location.href).searchParams.get("build") ?? "dev";
const CACHE = `carmen-${BUILD}`;
const CACHED_FOLDERS = /\/(disks|state|soundfont|v86|lib|bios|icons)\//;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        for (const name of await caches.keys()) {
            if (name.startsWith("carmen-") && name !== CACHE) await caches.delete(name);
        }
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== "GET" || url.origin !== self.location.origin) return;
    if (!CACHED_FOLDERS.test(url.pathname) || request.headers.has("range")) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
    })());
});
