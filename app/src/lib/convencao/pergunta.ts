// Perguntas sobre a Convenção (texto inteiro, em integral.ts) e as
// atas das assembleias.
//
// A IA não recebe o documento todo: são ~100 mil caracteres, e o Groq (o
// segundo da cascata) recusa pedido desse tamanho na cota gratuita. Ela recebe
// os trechos que a busca local acha para a pergunta, mais o quadro da unidade
// quando a pergunta fala de fração, rateio ou Garden. A mesma busca é a
// resposta da demonstração e a reserva quando a IA não responde.

import { CORPO, TABELAS } from "./integral.ts";

export const sem = (s: unknown) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Palavra do dia a dia → como a Convenção escreve. */
const SINONIMOS: Record<string, string[]> = {
  carro: ["veiculo", "vaga", "estacionamento", "automove"],
  carros: ["veiculo", "vaga", "estacionamento", "automove"],
  moto: ["motocicleta", "vaga"],
  estacionar: ["estacionamento", "vaga", "veiculo"],
  parar: ["estacionamento", "vaga"],
  garagem: ["vaga", "estacionamento"],
  inadimplente: ["quites", "inadimplent", "adimplente", "atraso"],
  inadimplentes: ["quites", "inadimplent", "adimplente", "atraso"],
  devendo: ["quites", "inadimplent", "atraso"],
  votar: ["voto", "votar", "votacao", "votados"],
  voto: ["voto", "votar", "votacao"],
  barulho: ["sossego", "silencio", "ruido", "alto-falante"],
  som: ["sossego", "alto-falante", "musica", "silencio"],
  obra: ["obras", "reforma", "reparo"],
  reforma: ["obras", "reforma"],
  multa: ["multa", "penalidade"],
  sindico: ["sindico"],
  mandato: ["mandato"],
  aluguel: ["locacao", "alugar", "locatario"],
  alugar: ["locacao", "alugar", "locatario"],
  airbnb: ["residencial", "hospedagem", "locacao"],
  churrasco: ["churrasqueira"],
  piscina: ["piscina"],
  procuracao: ["procurador", "procuracao", "mandatario"],
  visita: ["visitantes"],
  visitante: ["visitantes"],
  cota: ["contribuicao", "cota", "rateio"],
  condominio: [],
};

const VAZIAS = new Set(
  "a o as os de da do das dos e em no na nos nas um uma uns umas que se por para com sem como qual quais quanto quantos quantas quem pode podem ter tem algo alguma algum sobre isso esta este essa esse fala falar diz dizer convencao me traga traz mostra ou nao sim ao aos pela pelo pelas pelos ser sao foi mais menos".split(" "),
);

/** Raízes da pergunta: a palavra cortada em 6 letras pega plural e flexão. */
function raizes(pergunta: string): string[] {
  const palavras = sem(pergunta).split(/[^a-z0-9-]+/).filter((p) => p.length >= 3 && !VAZIAS.has(p));
  const todas = new Set<string>();
  for (const p of palavras) {
    todas.add(p.slice(0, 6));
    for (const s of SINONIMOS[p] ?? []) todas.add(s.slice(0, 6));
  }
  return [...todas];
}

export interface Trecho { item: string; capitulo: string; texto: string }

const ITEM = /^(\d+(?:\.\d+)+\.?|\([ivxl]+(?:\.\d+)?\)|[a-h]\))/i;

// Cada parágrafo com o capítulo e o último item numerado acima dele: um
// "(iii)" sozinho não diz nada a quem lê a resposta.
const PARAGRAFOS: Trecho[] = (() => {
  let capitulo = "";
  let numerado = "";
  return CORPO.filter((t) => !t.startsWith("[Folha")).map((texto) => {
    if (/^CAPÍTULO/.test(texto)) capitulo = texto.replace(/:.*$/, "").slice(0, 90);
    const m = texto.match(ITEM)?.[1] ?? "";
    if (/^\d/.test(m)) numerado = m.replace(/\.$/, "");
    const item = m && !/^\d/.test(m) && numerado ? `${numerado} ${m}` : m.replace(/\.$/, "");
    return { item, capitulo, texto };
  });
})();

/** Os trechos da Convenção que mais batem com a pergunta, na ordem do documento. */
export function buscarNaConvencao(pergunta: string, limite = 6): Trecho[] {
  const rs = raizes(pergunta);
  if (!rs.length) return [];
  const notas = PARAGRAFOS.map((p, i) => {
    const t = sem(p.texto);
    const acertos = rs.filter((r) => t.includes(r)).length;
    return { i, nota: acertos + (acertos ? Math.min(acertos, 2) * 0.1 : 0) };
  }).filter((x) => x.nota >= 1);
  const melhor = Math.max(0, ...notas.map((n) => n.nota));
  // Com várias palavras, quem acerta uma só é ruído.
  const corte = rs.length >= 3 ? Math.max(1, melhor - 1) : 1;
  return notas
    .filter((n) => n.nota >= corte)
    .sort((a, b) => b.nota - a.nota)
    .slice(0, limite)
    .sort((a, b) => a.i - b.i)
    .map((n) => PARAGRAFOS[n.i]);
}

/**
 * Linhas dos quadros (Garden, frações, rateio) que a pergunta pede: a unidade
 * citada ("bloco 2 apto 103", "2-103") ou, sem unidade, nada — o quadro inteiro
 * não cabe na pergunta e não ajuda.
 */
export function linhasDosQuadros(pergunta: string): string[] {
  const q = sem(pergunta);
  const quer = /frac|rateio|garden|metrag|area|crd|coeficiente/.test(q);
  if (!quer) return [];
  const unidades = new Set<string>();
  for (const m of q.matchAll(/\b([1-8])\s*[-/]\s*([1-5]0[1-9])\b/g)) unidades.add(`${m[1]}-${m[2]}`);
  const bloco = q.match(/bloco\s*([1-8])/)?.[1];
  const apto = q.match(/\b(?:apto|apartamento|unidade|ap)\.?\s*([1-5]0[1-9])\b/)?.[1];
  if (bloco && apto) unidades.add(`${bloco}-${apto}`);
  if (!unidades.size) return [];
  const saida: string[] = [];
  for (const { titulo, linhas } of Object.values(TABELAS)) {
    for (const l of linhas) if (unidades.has(l.split(":")[0])) saida.push(`${titulo}: ${l}`);
  }
  return saida;
}

/** Ata como chega do banco (colunas de texto com JSON nas listas). */
export interface AtaParaPergunta { titulo?: string; data_assembleia?: string; resumo_geral?: string; decisoes?: unknown }

function lista(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  try { const p = JSON.parse(String(v ?? "[]")); return Array.isArray(p) ? p.map(String) : []; } catch { return []; }
}

/** Decisões de ata que batem com a pergunta (para a resposta local). */
export function buscarNasAtas(pergunta: string, atas: AtaParaPergunta[], limite = 3) {
  const rs = raizes(pergunta);
  if (!rs.length) return [];
  const achados: { ata: string; data: string; decisao: string; nota: number }[] = [];
  for (const a of atas) {
    for (const d of lista(a.decisoes)) {
      const t = sem(d);
      const nota = rs.filter((r) => t.includes(r)).length;
      if (nota) achados.push({ ata: a.titulo ?? "Ata", data: a.data_assembleia ?? "", decisao: d, nota });
    }
  }
  const melhor = Math.max(0, ...achados.map((x) => x.nota));
  const corte = rs.length >= 3 ? Math.max(1, melhor - 1) : 1;
  return achados.filter((x) => x.nota >= corte).sort((a, b) => b.nota - a.nota).slice(0, limite);
}

export const rotuloDoTrecho = (t: Trecho) => (t.item ? `Item ${t.item}` : t.capitulo || "Convenção");

/** O pedido à IA: trechos da Convenção + quadros da unidade + atas. */
export function instrucaoPerguntaConvencao(pergunta: string, atas: AtaParaPergunta[]): string {
  const trechos = buscarNaConvencao(pergunta, 30);
  const quadros = linhasDosQuadros(pergunta);
  const contextoAtas = atas.map((a) => {
    const ds = lista(a.decisoes);
    return [
      `ATA: ${a.titulo ?? ""} | Data: ${a.data_assembleia ?? ""}`,
      `Resumo: ${String(a.resumo_geral ?? "").slice(0, 800)}`,
      `Decisões: ${ds.length ? ds.map((d, k) => `${k + 1}) ${d}`).join(" ") : "nenhuma"}`,
    ].join("\n");
  }).join("\n\n").slice(0, 20000);

  return [
    "Você responde perguntas sobre a Convenção do Condomínio Diduccio e as atas das assembleias, para o síndico e a administração.",
    "Regras:",
    "1. Use SOMENTE os trechos e as atas abaixo. Não invente item, número nem regra.",
    "2. Cite sempre o número do item da Convenção (ex.: \"item 9.9\") e, quando usar uma ata, o título e a data dela.",
    "3. Se uma ata decidiu algo diferente da Convenção sobre o assunto, diga as duas coisas e que a decisão da assembleia é mais recente.",
    "4. Se a resposta não estiver nos trechos nem nas atas, diga que não encontrou isso na Convenção nem nas atas.",
    "5. Português simples, direto, em até 6 frases. Sem markdown, sem asteriscos.",
    "",
    "=== TRECHOS DA CONVENÇÃO ===",
    trechos.length ? trechos.map((t) => `[${rotuloDoTrecho(t)} | ${t.capitulo}] ${t.texto}`).join("\n") : "(nenhum trecho encontrado pela busca)",
    quadros.length ? `\n=== QUADROS DA CONVENÇÃO (da unidade perguntada) ===\n${quadros.join("\n")}` : "",
    "",
    "=== ATAS DAS ASSEMBLEIAS ===",
    contextoAtas || "(nenhuma ata cadastrada)",
    "",
    "=== PERGUNTA ===",
    pergunta,
  ].join("\n");
}
