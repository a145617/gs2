// ひとこま Service Worker
// - ページ遷移: ネットワーク優先。オフライン時は /offline を表示
// - Next.js の静的ファイル・投稿画像（/media）: キャッシュ優先（内容が変わらないURLのため）
const VERSION = "v1";
const STATIC_CACHE = `hk-static-${VERSION}`;
const MEDIA_CACHE = `hk-media-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png"])).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === "basic") {
    cache.put(request, res.clone());
    if (maxEntries) {
      cache.keys().then((keys) => {
        if (keys.length > maxEntries) cache.delete(keys[0]);
      });
    }
  }
  return res;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()),
    );
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
  if (url.pathname.startsWith("/media/")) {
    event.respondWith(cacheFirst(request, MEDIA_CACHE, 300));
  }
});
