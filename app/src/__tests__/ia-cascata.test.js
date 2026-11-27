// @vitest-environment node
//
// Node, e não jsdom, pelo mesmo motivo de edge-functions.test.js: aqui nada
// monta componente, e o `fetch` falso é mais simples fora do jsdom.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pedirEmCascata } from "../../supabase/functions/ia/cascata.ts";

/**
 * A cascata de provedores da função `ia`: Gemini com a chave principal, Groq,
 * e por fim Gemini com a chave reserva — de OUTRO projeto do Google.
 *
 * A reserva existe porque a cota gratuita do Gemini é por dia e por projeto:
 * 20 requisições no gemini-3.8-flash em 2026-09. Uma segunda chave do mesmo
 * projeto não ajudaria em nada. E ela vem por ÚLTIMO de propósito: gastá-la
 * antes do Groq esvaziaria as duas cotas no mesmo dia, e o dia seguinte
 * começaria sem reserva nenhuma.
 *
 * O caminho do PDF escaneado é o único que só o Gemini atende (o Groq não lê
 * PDF): lá a cascata pula o Groq e vai da principal direto para a reserva. Era
 * exatamente o caminho que não tinha para onde cair quando a cota acabou.
 */

const CHAVES = { gemini: "chave-A", groq: "chave-groq", geminiB: "chave-B" };

/** Uma resposta HTTP de mentira, com o corpo já em texto. */
const resposta = (status, corpo) => ({
  ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(corpo),
});
const geminiOk = (texto) => resposta(200, { candidates: [{ content: { parts: [{ text: texto }] } }] });
const groqOk = (texto) => resposta(200, { choices: [{ message: { content: texto } }] });
const NAO_EXISTE = resposta(404, { error: { code: 404, message: "This model is no longer available." } });
const SEM_COTA = resposta(429, { error: { code: 429, message: "You exceeded your current quota" } });
const GROQ_LIMITE = resposta(429, { error: { message: "Rate limit reached" } });

/** Quem recebeu a chamada: "A" ou "B" (Gemini, pela chave no cabeçalho) ou "groq". */
function quem(url, opcoes) {
  if (String(url).includes("groq.com")) return "groq";
  return opcoes.headers["X-goog-api-key"] === CHAVES.gemini ? "A" : "B";
}

/** Fetch falso em que cada provedor responde sempre a mesma coisa. Devolve a
 *  ordem em que foram chamados. */
function provedores(mapa) {
  const chamadas = [];
  globalThis.fetch = vi.fn(async (url, opcoes) => {
    const p = quem(url, opcoes);
    chamadas.push(p);
    return mapa[p];
  });
  return chamadas;
}

/** Roda a cascata com o relógio falso: as pausas entre tentativas passam na hora. */
async function cascata(chaves, instrucao) {
  const partes = instrucao === null
    ? [{ inline_data: { mime_type: "application/pdf", data: "JVBERi0=" } }, { text: "resuma" }]
    : [{ text: instrucao }];
  const p = pedirEmCascata(chaves, partes, instrucao, true);
  await vi.runAllTimersAsync();
  return p;
}

/** Os provedores distintos que apareceram, na ordem da primeira chamada. */
const ordem = (chamadas) => [...new Set(chamadas)];

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("pedirEmCascata", () => {
  it("quando a chave principal responde, nem o Groq nem a reserva são chamados", async () => {
    const chamadas = provedores({ A: geminiOk("{\"ok\":1}"), groq: groqOk("x"), B: geminiOk("y") });

    const r = await cascata(CHAVES, "resuma a ata");

    expect(r.texto).toBe("{\"ok\":1}");
    expect(ordem(chamadas)).toEqual(["A"]);
  });

  it("quando a principal falha, o Groq responde e a reserva não é gasta", async () => {
    const chamadas = provedores({ A: NAO_EXISTE, groq: groqOk("do groq"), B: geminiOk("y") });

    const r = await cascata(CHAVES, "resuma a ata");

    expect(r.texto).toBe("do groq");
    expect(ordem(chamadas)).toEqual(["A", "groq"]);
  });

  it("quando principal e Groq falham, a reserva do outro projeto responde", async () => {
    const chamadas = provedores({ A: SEM_COTA, groq: GROQ_LIMITE, B: geminiOk("da reserva") });

    const r = await cascata(CHAVES, "resuma a ata");

    expect(r.texto).toBe("da reserva");
    expect(ordem(chamadas)).toEqual(["A", "groq", "B"]);
    // O log precisa dizer QUAL chave falhou: os dois lados usam os mesmos
    // nomes de modelo, e sem o rótulo o diagnóstico seria ambíguo.
    expect(r.diagnostico.some((d) => d.startsWith("Gemini-A"))).toBe(true);
    expect(r.diagnostico.some((d) => d.startsWith("Groq"))).toBe(true);
  });

  it("PDF: o Groq é pulado e a queda vai direto para a reserva", async () => {
    const chamadas = provedores({ A: SEM_COTA, groq: groqOk("nunca"), B: geminiOk("ocr da reserva") });

    const r = await cascata(CHAVES, null);

    expect(r.texto).toBe("ocr da reserva");
    expect(ordem(chamadas)).toEqual(["A", "B"]);
  });

  it("sem chave reserva, a cascata termina no Groq", async () => {
    const chamadas = provedores({ A: NAO_EXISTE, groq: GROQ_LIMITE, B: geminiOk("nunca") });

    const r = await cascata({ ...CHAVES, geminiB: "" }, "resuma a ata");

    expect(r.texto).toBe("");
    expect(ordem(chamadas)).toEqual(["A", "groq"]);
  });

  it("a mensagem de sobrecarga só sai quando algum lado disse 429 ou 5xx", async () => {
    provedores({ A: SEM_COTA, groq: GROQ_LIMITE, B: SEM_COTA });
    const semCota = await cascata(CHAVES, "resuma a ata");
    expect(semCota.texto).toBe("");
    expect(semCota.sobrecarga).toBe(true);
    // A reserva falhou também, e o log precisa mostrar isso com o rótulo dela.
    expect(semCota.diagnostico.some((d) => d.startsWith("Gemini-B"))).toBe(true);

    provedores({ A: NAO_EXISTE, groq: resposta(400, { error: "bad" }), B: NAO_EXISTE });
    const definitivo = await cascata(CHAVES, "resuma a ata");
    expect(definitivo.texto).toBe("");
    expect(definitivo.sobrecarga).toBe(false);
  });
});
