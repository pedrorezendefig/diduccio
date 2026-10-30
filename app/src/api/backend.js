// POST ao Apps Script LENDO a resposta (sem mode: "no-cors").
// O /exec redireciona para googleusercontent, que libera CORS — então dá para ler o JSON.
//
// Comportamento:
// - Resposta lida e success === false  → alerta a mensagem do backend (ex.: "Sessão inválida",
//   "Não autorizado") e retorna o json — o chamador decide se aborta o fluxo.
// - Falha de leitura (CORS/rede)       → retorna null e segue em MODO OTIMISTA, igual ao
//   antigo no-cors (a gravação provavelmente ocorreu).
//
// Opção { silencioso: true } suprime o aviso (para gravações em segundo plano).
import { reportarErro } from "./reporter";

export async function postBackend(apiUrl, payload, { silencioso = false } = {}) {
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload),
    });
    let json = null;
    try {
      json = await response.json();
    } catch {
      return null; // não deu para ler — modo otimista
    }
    if (json && json.success === false && !silencioso) {
      reportarErro(json.message || "A operação não foi concluída. Tente novamente.");
    }
    return json;
  } catch {
    return null; // falha de rede/CORS — modo otimista
  }
}
