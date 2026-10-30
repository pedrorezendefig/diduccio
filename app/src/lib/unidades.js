/**
 * Achar uma unidade digitando.
 *
 * O condomínio tem 128 unidades. Num `<select>` isso é rolar até achar; quem
 * usa o sistema decorou a forma concatenada — "5206" é bloco 5, apto 206 — e é
 * assim que digita. A busca aceita as duas: o atalho e o jeito por extenso.
 *
 * A regra mora aqui, e não dentro do componente, porque ela é a parte que erra
 * calada: digitar "5206" e não achar a unidade que existe não quebra tela
 * nenhuma — a pessoa conclui que o cadastro não está lá.
 */

/** Sem acento, minúsculo, sem espaço nas pontas. */
export const normalizar = (s) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Quantas sugestões cabem sem a lista virar rolagem. */
export const LIMITE_SUGESTOES = 8;

/**
 * O que foi digitado casa com esta unidade?
 *
 * Cada palavra do termo tem de aparecer — "5 206" e "bloco 5 206" acham a
 * mesma coisa que "5206", e "B5-206", que é como as tabelas escrevem, também.
 * Termo vazio não casa com nada: é quem chama que decide o que vazio
 * significa (a sugestão não sugere; o filtro não filtra).
 *
 * Serve à sugestão do formulário e ao filtro do histórico da portaria, e é
 * uma regra só de propósito: o que acha a unidade num lugar tem de achá-la
 * no outro.
 */
export function casaComUnidade(termo, u) {
  const partes = normalizar(termo).split(/\s+/).filter(Boolean);
  if (partes.length === 0) return false;

  const bloco = String(u?.bloco ?? "").trim();
  const apto = String(u?.unidade ?? "").trim();
  // Sem unidade não há alvo. Escrever "null" nele faria o termo "null" achar
  // o serviço do próprio condomínio, que entra sem bloco.
  if (!bloco && !apto) return false;

  const alvo = normalizar(
    `${bloco}${apto} ${bloco} ${apto} bloco ${bloco} apto ${apto} b${bloco}-${apto}`
  );
  return partes.every((p) => alvo.includes(p));
}

/**
 * As unidades que casam com o que foi digitado.
 *
 * Vazio devolve lista vazia, e não a lista inteira: a sugestão aparece porque
 * alguém digitou, não porque o campo ganhou foco.
 */
export function buscarUnidades(unidades, termo, limite = LIMITE_SUGESTOES) {
  return (unidades ?? []).filter((u) => casaComUnidade(termo, u)).slice(0, limite);
}

/** "B5-206" — a etiqueta curta, a mesma que as tabelas usam. */
export const rotuloCurtoDaUnidade = (u) => (u ? `B${u.bloco}-${u.unidade}` : "");
