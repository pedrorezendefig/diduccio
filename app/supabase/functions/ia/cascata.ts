// A cascata de provedores da função `ia`, sem nada do Deno.
//
// Vive num arquivo próprio porque o index.ts termina em `Deno.serve`, e isso
// não carrega no vitest. Aqui só existe `fetch` — que o teste consegue fingir
// —, e é o que permite verificar a ORDEM da cascata de verdade, e não por
// expressão regular no fonte (ia-cascata.test.js).

// Três modelos VIVOS, e é isso que faz a lista valer: a cota gratuita do Gemini
// é por modelo, e o 503 "high demand" também é por modelo. Os antigos
// gemini-2.5-flash e gemini-2.0-flash respondiam 404 (desligados pelo Google em
// 2026), e a lista tinha na prática um modelo só — quando ele caía, nada mais
// respondia. `gemini-flash-latest` é um apelido que o Google troca a cada
// versão (gemini-3.8-flash em 2026-09); os outros dois são nomes fixos.
const MODELOS_GEMINI = ["gemini-flash-latest", "gemini-3.6-flash", "gemini-3.5-flash-lite"];
const GEMINI_URL = (modelo: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;

/** Texto da primeira candidata, ou "" se a resposta veio sem conteúdo. */
function textoDoGemini(corpo: any): string {
  return corpo?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

export type Tentativa = { texto: string; diagnostico: string[]; sobrecarga: boolean };

/** As chaves, na ordem em que a cascata as usa. Vazia = provedor ausente. */
export type Chaves = { gemini: string; groq: string; geminiB: string };

/**
 * Percorre os modelos do Gemini até um responder.
 *
 * O 503 "high demand" é transitório e frequente: repetir o mesmo modelo depois
 * de uma pausa resolve na maioria das vezes; erro definitivo (400, 403, 404) não
 * melhora com espera e só custa tempo, então pula direto para o próximo modelo.
 *
 * `rotulo` entra no diagnóstico: com duas chaves, os mesmos nomes de modelo
 * aparecem duas vezes no log, e sem o rótulo não dá para saber qual falhou.
 */
export async function pedirAoGemini(chave: string, partes: unknown[], jsonPuro: boolean, rotulo = "Gemini"): Promise<Tentativa> {
  const diagnostico: string[] = [];
  let sobrecarga = false;
  const corpo = JSON.stringify({
    contents: [{ parts: partes }],
    ...(jsonPuro ? { generationConfig: { responseMimeType: "application/json" } } : {}),
  });

  for (const modelo of MODELOS_GEMINI) {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      if (tentativa > 0) await new Promise((r) => setTimeout(r, 1500));
      try {
        const resp = await fetch(GEMINI_URL(modelo), {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-goog-api-key": chave },
          body: corpo,
        });
        const bruto = await resp.text();
        if (resp.ok) {
          const texto = textoDoGemini(JSON.parse(bruto || "{}"));
          if (texto) return { texto, diagnostico, sobrecarga };
          diagnostico.push(`${rotulo}/${modelo} 200 sem texto`);
        } else if (resp.status === 429 || resp.status >= 500) {
          sobrecarga = true;
          // O corpo entra no log de propósito: é ele que distingue cota da
          // chave esgotada, limite por minuto e modelo sobrecarregado — três
          // causas com três remédios diferentes, e o mesmo status HTTP.
          diagnostico.push(`${rotulo}/${modelo} HTTP ${resp.status} (transitório): ${bruto.replace(/\s+/g, " ").slice(0, 1000)}`);
          continue; // vale repetir
        } else {
          diagnostico.push(`${rotulo}/${modelo} HTTP ${resp.status}: ${bruto.slice(0, 120)}`);
          break; // definitivo: próximo modelo
        }
      } catch (e) {
        diagnostico.push(`${rotulo}/${modelo} EXC: ${e}`);
      }
    }
  }
  return { texto: "", diagnostico, sobrecarga };
}

/** Queda para o Groq. Não lê PDF — só serve para os caminhos de texto. */
export async function pedirAoGroq(chave: string, instrucao: string, jsonPuro: boolean): Promise<Tentativa> {
  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [{ role: "user", content: instrucao }],
        ...(jsonPuro ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    const bruto = await resp.text();
    if (!resp.ok) return { texto: "", diagnostico: [`Groq HTTP ${resp.status}: ${bruto.slice(0, 120)}`], sobrecarga: resp.status >= 429 };
    const texto = JSON.parse(bruto || "{}")?.choices?.[0]?.message?.content ?? "";
    return { texto, diagnostico: texto ? [] : ["Groq 200 sem texto"], sobrecarga: false };
  } catch (e) {
    return { texto: "", diagnostico: [`Groq EXC: ${e}`], sobrecarga: false };
  }
}

/** Junta duas tentativas: o texto é o da última, o diagnóstico acumula e a
 *  sobrecarga fica se qualquer uma viu. */
function somar(a: Tentativa, b: Tentativa): Tentativa {
  return { texto: b.texto, diagnostico: [...a.diagnostico, ...b.diagnostico], sobrecarga: a.sobrecarga || b.sobrecarga };
}

/**
 * Gemini com a chave principal → Groq → Gemini com a chave reserva.
 *
 * A reserva (GEMINI_API_KEY_B) é de OUTRO projeto do Google, e é isso que a
 * faz valer: a cota gratuita do Gemini é por dia e por projeto — 20
 * requisições no gemini-3.8-flash em 2026-09 —, então uma segunda chave do
 * mesmo projeto não acrescentaria nada. Ela vem por último de propósito: é o
 * que sobra quando tudo o mais falhou, e gastá-la antes do Groq esvaziaria as
 * duas cotas no mesmo dia.
 *
 * `instrucao` nula é o caminho do PDF escaneado: só o Gemini lê PDF, então o
 * Groq é pulado e a cascata vira principal → reserva. Era o caminho que não
 * tinha para onde cair quando a cota acabou.
 */
export async function pedirEmCascata(chaves: Chaves, partes: unknown[], instrucao: string | null, jsonPuro: boolean): Promise<Tentativa> {
  let r: Tentativa = { texto: "", diagnostico: [], sobrecarga: false };
  if (chaves.gemini) r = somar(r, await pedirAoGemini(chaves.gemini, partes, jsonPuro, "Gemini-A"));
  if (!r.texto && chaves.groq && instrucao !== null) r = somar(r, await pedirAoGroq(chaves.groq, instrucao, jsonPuro));
  if (!r.texto && chaves.geminiB) r = somar(r, await pedirAoGemini(chaves.geminiB, partes, jsonPuro, "Gemini-B"));
  return r;
}
