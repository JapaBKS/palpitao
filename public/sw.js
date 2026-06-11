/* Service Worker — Bolão da Copa 2026
 *
 * Estratégia escolhida com cuidado para um app que depende de dados ao vivo (Supabase):
 *  - Chamadas de API/realtime (Supabase) NUNCA são cacheadas → sempre rede.
 *  - Navegação (HTML) usa "network-first": tenta a rede; se estiver offline,
 *    serve a última versão em cache, para o app pelo menos abrir.
 *  - Assets estáticos (ícones, manifest, JS/CSS) usam "stale-while-revalidate":
 *    responde rápido do cache e atualiza em segundo plano.
 *
 * Bump a versão (CACHE_VERSION) sempre que publicar uma mudança importante
 * para forçar a limpeza do cache antigo.
 */

const CACHE_VERSION = "bolao-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Arquivos garantidos no primeiro carregamento (App Shell).
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      // addAll falha tudo se um arquivo faltar; aqui adicionamos um a um tolerando erros.
      Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  // Nunca cachear Supabase nem websockets/realtime.
  return (
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("supabase.in") ||
    url.pathname.includes("/realtime/") ||
    url.pathname.includes("/rest/") ||
    url.pathname.includes("/auth/")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Só lida com GET; o resto (POST/upsert do Supabase) passa direto.
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // Dados ao vivo: sempre rede, sem cache.
  if (isApiRequest(url)) return;

  // Outras origens (CDN de fontes etc.): stale-while-revalidate simples.
  const sameOrigin = url.origin === self.location.origin;

  // Navegação de página: network-first com fallback ao cache.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
    );
    return;
  }

  // Assets estáticos: stale-while-revalidate.
  if (sameOrigin || url.hostname.includes("fonts.googleapis.com") || url.hostname.includes("fonts.gstatic.com")) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});
