/**
 * Os números que o paginador mostra: a primeira, a última e as vizinhas da
 * atual, com "…" no buraco. Com poucas páginas (até 7), todas.
 *
 *   numerosDasPaginas(5, 30) → [1, "…", 4, 5, 6, "…", 30]
 *
 * Existe porque o ‹ 1 2 › do Histórico desenhava um botão por página: com as
 * encomendas (centenas), 20 por página davam dezenas de botões numa linha.
 */
export function numerosDasPaginas(atual, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const meio = [atual - 1, atual, atual + 1].filter((p) => p > 1 && p < total);
  // Perto das pontas, mostra 3 de cada lado em vez de ficar só a ponta.
  if (atual <= 3) meio.push(...[2, 3, 4].filter((p) => !meio.includes(p)));
  if (atual >= total - 2) meio.unshift(...[total - 3, total - 2, total - 1].filter((p) => !meio.includes(p)));
  const unicos = [...new Set(meio)].sort((a, b) => a - b);
  const lista = [1];
  if (unicos[0] > 2) lista.push("…");
  lista.push(...unicos);
  if (unicos[unicos.length - 1] < total - 1) lista.push("…");
  lista.push(total);
  return lista;
}
