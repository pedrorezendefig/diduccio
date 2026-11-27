// Regras da carteirinha da piscina que não dependem de tela: idade, atestado
// vencido, o nome que cabe no cartão e o conteúdo do QR code.
//
// O QR leva SÓ o identificador do cadastro, nunca nome, CPF ou nascimento: a
// carteirinha anda na mão do morador e qualquer celular lê um QR. Quem lê de
// verdade é o sistema, que busca o cadastro pelo id (com a permissão de quem
// está logado) e daí mostra nome, validade e a idade calculada na hora.

const PREFIXO_QR = "NR-PISCINA:";

/**
 * As cores das manchas do fundo. Vão como atributo `fill` no SVG, e não por
 * classe CSS: o html-to-image não leva o `fill` vindo de CSS para a imagem, e
 * a carteirinha baixada saía com as manchas pretas.
 */
export const CORES_DO_FUNDO = { claro: "#D4BCB8", escuro: "#4D150B" };

/** O QR sai no verde da carteirinha sobre branco (cor de papel, fixa). */
export const CORES_DO_QR = { dark: "#4D150B", light: "#FFFFFF" };

/** "2026-03-15" ou "15/03/2026" → { a, m, d }, ou null. */
function partesDaData(valor) {
  const s = String(valor ?? "").trim().split(/[ T]/)[0];
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { a: +m[1], m: +m[2], d: +m[3] };
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return { a: +m[3], m: +m[2], d: +m[1] };
  return null;
}

/** Hoje no fuso de Brasília, como { a, m, d }. */
function hojeEmBrasilia(agora = new Date()) {
  const [a, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
    .format(agora).split("-").map(Number);
  return { a, m, d };
}

/** Idade em anos completos na data de hoje (Brasília). null sem nascimento válido. */
export function idade(nascimento, agora = new Date()) {
  const n = partesDaData(nascimento);
  if (!n) return null;
  const h = hojeEmBrasilia(agora);
  let anos = h.a - n.a;
  if (h.m < n.m || (h.m === n.m && h.d < n.d)) anos -= 1;
  return anos >= 0 && anos < 130 ? anos : null;
}

/** "34 anos", "1 ano", ou "" sem data. */
export const textoDaIdade = (nascimento, agora) => {
  const i = idade(nascimento, agora);
  return i === null ? "" : `${i} ${i === 1 ? "ano" : "anos"}`;
};

/** O atestado vence no fim do dia da validade: no próprio dia ainda vale. */
export function atestadoVencido(validade, agora = new Date()) {
  const v = partesDaData(validade);
  if (!v) return false;
  const h = hojeEmBrasilia(agora);
  return h.a * 10000 + h.m * 100 + h.d > v.a * 10000 + v.m * 100 + v.d;
}

/** O texto que vai no QR code da carteirinha. */
export const textoDoQr = (id) => `${PREFIXO_QR}${id}`;

/** Lê um QR da carteirinha: devolve o id do cadastro, ou null se não for um. */
export function lerQrDaCarteirinha(texto) {
  const s = String(texto ?? "").trim();
  if (!s.startsWith(PREFIXO_QR)) return null;
  const id = s.slice(PREFIXO_QR.length).trim();
  return /^[A-Za-z0-9_-]{1,40}$/.test(id) ? id : null;
}

/**
 * O nome que cabe na linha do cartão: até 22 letras vai inteiro; passando,
 * caem sobrenomes do fim (e as preposições que sobrarem penduradas) até caber
 * em 26, sempre ficando nome e um sobrenome. Nome de duas palavras longas não
 * encolhe: o CSS corta com reticências (.cart__nome).
 */
export function nomeDaCarteirinha(nome = "") {
  const completo = String(nome).trim().replace(/\s+/g, " ");
  if (!completo) return "—";
  if (completo.length <= 22) return completo;
  const PENDURADA = (p) => ["da", "de", "do", "das", "dos", "e"].includes(p.toLowerCase()) || p.length <= 1;
  let partes = completo.split(" ");
  do {
    if (partes.length > 2) partes = partes.slice(0, -1);
    while (partes.length > 2 && PENDURADA(partes[partes.length - 1])) partes.pop();
  } while (partes.join(" ").length > 26 && partes.length > 2);
  return partes.join(" ");
}
