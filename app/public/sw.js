/*
 * Service worker do ViT.
 *
 * Existe para duas coisas, e para NENHUMA terceira:
 *   1. tornar o sistema instalável na tela inicial do celular;
 *   2. abrir rápido quando a rede da portaria estiver ruim.
 *
 * O QUE ELE NÃO FAZ, DE PROPÓSITO
 *
 * Não guarda resposta de API. Nada do Supabase passa por aqui — é outra origem,
 * e mesmo se fosse a mesma, servir encomenda ou retirada de um cache seria pior
 * que a tela não carregar: o porteiro veria um pacote que já saiu, ou não veria
 * um que chegou, sem nada na tela dizendo que aquilo é velho. Dado de
 * condomínio vem da rede ou não vem.
 *
 * Guarda só o que o build produz com nome versionado (`/assets/algo-a1b2c3.js`).
 * Esse nome muda a cada publicação, então cache velho nunca é servido no lugar
 * de código novo — o arquivo simplesmente deixa de ser pedido.
 */

const CACHE = "vit-casca-v1";
const PAGINA = "/index.html";

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((c) => c.add(PAGINA)).catch(() => {}).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;

  // Só GET e só a nossa origem. POST de login e chamada ao Supabase passam
  // direto, sem este arquivo no meio.
  if (pedido.method !== "GET") return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  // Navegação: rede primeiro. Sem rede, devolve a casca guardada — o app abre e
  // mostra o próprio erro de conexão, que é melhor que a tela de dinossauro.
  if (pedido.mode === "navigate") {
    evento.respondWith(
      fetch(pedido).catch(() => caches.match(PAGINA).then((r) => r || Response.error()))
    );
    return;
  }

  // Arquivo versionado do build: cache primeiro, porque o conteúdo daquele nome
  // nunca muda. É o que faz o app abrir instantâneo na segunda vez.
  if (url.pathname.startsWith("/assets/")) {
    evento.respondWith(
      caches.match(pedido).then((guardado) => {
        if (guardado) return guardado;
        return fetch(pedido).then((resposta) => {
          // Só guarda o que veio inteiro e bem: resposta parcial ou de erro
          // guardada vira uma tela quebrada que sobrevive ao recarregamento.
          if (resposta.ok && resposta.status === 200) {
            const copia = resposta.clone();
            caches.open(CACHE).then((c) => c.put(pedido, copia)).catch(() => {});
          }
          return resposta;
        });
      })
    );
  }

  // O resto (favicon, manifest, fontes) segue o caminho normal do navegador.
});
