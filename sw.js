const CACHE_NAME = "varal-iot-v3";
// Lista de ativos estáticos essenciais para a interface (App Shell)
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./firebase.js",
  "./varalpequeno.png",
  "./varalgrande.png"
  // Adicione aqui bibliotecas CDN se usar, ex: "https://unpkg.com/lucide@latest"
];

// Instalação: Faz o cache dos ativos estáticos
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] Cache aberto. Adicionando ativos estáticos.");
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Força o SW a assumir o controle imediatamente após a instalação
  self.skipWaiting();
});

// Ativação: Remove caches antigos
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[SW] Removendo cache antigo:", key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  // Reivindica os clientes imediatamente
  self.clients.claim();
});

// Interceptação de requisições (Fetch)
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // ESTRATÉGIA 1: Ignorar chamadas de API do Firebase (não cachear dados dinâmicos)
  if (url.hostname.includes("firebaseio.com") || url.hostname.includes("googleapis.com")) {
    // Modo "Network Only" para o Firebase para garantir tempo real
    event.respondWith(fetch(event.request));
    return;
  }

  // ESTRATÉGIA 2: Cache First para os ativos estáticos e Network Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Se estiver no cache, retorna o cacheado
      if (cachedResponse) {
        return cachedResponse;
      }

      // Se não estiver no cache, busca na rede
      return fetch(event.request).then((networkResponse) => {
        // Valida a resposta da rede
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        // Clona a resposta para guardar no cache (opcional para ativos que mudam pouco)
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          // Apenas cacheia os arquivos da lista STATIC_ASSETS
          if (STATIC_ASSETS.includes(event.request.url.replace(self.location.origin + '/', './'))) {
             // cache.put(event.request, responseToCache); // Descomente se quiser atualizar o cache automaticamente
          }
        });

        return networkResponse;
      }).catch(() => {
          // Fallback para quando estiver offline e o recurso não estiver no cache (opcional)
          if (event.request.destination === 'document') {
             return caches.match('./index.html'); // Retorna o index.html se tentar acessar uma página offline
          }
      });
    })
  );
});