// Instalação do modo demo.
//
// Em vez de mexer nas ~20 páginas, envelopamos o `fetch` global: toda chamada
// para a URL do backend é desviada para o servidor falso em memória; qualquer
// outra passa direto. As telas não sabem que estão em demo — é o mesmo código
// que roda contra o Apps Script real.

import { MODO_DEMO, URL_DEMO } from "../api/config";
import { atender } from "./servidor";

let instalado = false;

export function instalarModoDemo() {
  if (!MODO_DEMO || instalado || typeof window === "undefined") return;
  instalado = true;

  const fetchOriginal = window.fetch.bind(window);

  window.fetch = async (entrada, init = {}) => {
    const url = typeof entrada === "string" ? entrada : entrada?.url || "";
    if (!url.startsWith(URL_DEMO)) return fetchOriginal(entrada, init);

    // As páginas sempre chamam fetch(url, { method, body }) — basta ler o init.
    const metodo = String(init.method || "GET").toUpperCase();
    const dados = await atender({ url, metodo, corpo: init.body });

    return new Response(JSON.stringify(dados), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  console.info(
    "%cViT — modo demonstração",
    "background:#1f6feb;color:#fff;padding:2px 6px;border-radius:3px",
    "\nDados fictícios em memória. Nenhuma requisição sai desta máquina." +
      '\nTodos os perfis entram com a senha "demo".'
  );
}
