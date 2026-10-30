/**
 * O bloco de notas das Tarefas, sem tela.
 *
 * O bloco é texto livre, uma ideia por linha. "Linha" aqui é sempre a linha
 * com conteúdo, sem os espaços das pontas: é o que a lista "Passar para o
 * quadro" mostra, e é pelo índice DENTRO dessa lista que a tela pede para
 * tirar uma. As linhas em branco nunca contam.
 */

// "\r\n" primeiro: um bloco escrito no Windows (ou colado de lá) não pode
// deixar um "\r" grudado no fim do título da tarefa.
const partir = (texto) => String(texto ?? "").split(/\r\n|\r|\n/);

/** As linhas com conteúdo, cada uma sem os espaços das pontas. */
export function linhasDasNotas(texto) {
  return partir(texto).map((l) => l.trim()).filter(Boolean);
}

/**
 * Tira uma linha do bloco e devolve o texto novo.
 *
 * Primeiro tenta a do `indice` (contado entre as não vazias), se ela ainda for
 * a `esperado`. Entre escolher "virar tarefa" e salvar a tarefa o texto pode ter
 * mudado de lugar; aí sai a primeira linha igual. Se nenhuma for igual, nada
 * sai — tirar a linha errada seria perder uma anotação sem ninguém ver.
 *
 * As outras linhas ficam como a pessoa as escreveu, com os espaços e as linhas
 * em branco do meio: é o bloco dela, e a única mudança que ela pediu foi tirar
 * aquela linha. Só duas normalizações: as quebras voltam como "\n" (o que o
 * textarea usa), e as linhas em branco das PONTAS saem — tirar "A" de
 * "A\n\nB" dá "B", e um bloco que ficou só com espaços vira "", para o
 * contador e a lista "Nada anotado ainda" não verem sobra invisível.
 */
export function tirarLinha(texto, indice, esperado) {
  const original = String(texto ?? "");
  const alvo = String(esperado ?? "").trim();
  if (!alvo) return original;

  const brutas = partir(original);
  // Posição de cada linha com conteúdo dentro de `brutas`.
  const posicoes = [];
  brutas.forEach((l, i) => { if (l.trim()) posicoes.push(i); });

  let escolhida = -1;
  if (Number.isInteger(indice) && indice >= 0 && indice < posicoes.length && brutas[posicoes[indice]].trim() === alvo) {
    escolhida = posicoes[indice];
  } else {
    escolhida = posicoes.find((p) => brutas[p].trim() === alvo) ?? -1;
  }
  if (escolhida < 0) return original;

  const resto = brutas.filter((_, i) => i !== escolhida);
  // Tirar a primeira linha de "A\n\nB" deixaria o bloco começando em branco.
  // As linhas em branco das pontas saem; as do meio são da pessoa e ficam.
  while (resto.length && !resto[0].trim()) resto.shift();
  while (resto.length && !resto[resto.length - 1].trim()) resto.pop();
  return resto.join("\n");
}

/**
 * O bloco foi relido do banco: qual texto a tela passa a ter?
 *
 *   local      o que a tela tem agora (pode ter alteração ainda por gravar);
 *   banco      o que acabou de chegar;
 *   lidoAntes  o que a tela sabia que o banco tinha.
 *
 * O banco igual ao `lidoAntes`: ninguém mexeu de fora, fica o da tela. Senão,
 * outro aparelho gravou: se a tela não tinha nada por gravar, vale o banco;
 * se tinha, os dois mudaram e nenhum pode ganhar do outro calado — fica o
 * texto do banco e, no fim, as linhas da tela que ele não tem.
 *
 * As linhas contam com repetição: se a tela tem "x" duas vezes e o banco uma,
 * uma entra. E o que a tela APAGOU volta no conflito — rever uma anotação que
 * se quis apagar custa menos que perder uma que se quis guardar.
 *
 * Devolve `{ texto, conflito }`; a tela avisa quando `conflito`.
 */
export function juntarNotas(local, banco, lidoAntes) {
  const l = String(local ?? "");
  const b = String(banco ?? "");
  if (b === String(lidoAntes ?? "") || b === l) return { texto: l, conflito: false };
  if (l === String(lidoAntes ?? "")) return { texto: b, conflito: false };

  const noBanco = new Map();
  for (const linha of linhasDasNotas(b)) noBanco.set(linha, (noBanco.get(linha) ?? 0) + 1);
  const faltam = [];
  for (const linha of linhasDasNotas(l)) {
    const n = noBanco.get(linha) ?? 0;
    if (n > 0) noBanco.set(linha, n - 1);
    else faltam.push(linha);
  }
  if (!faltam.length) return { texto: b, conflito: true };
  // Sem a quebra do fim do banco: senão "B\n" + "\nC" deixaria uma linha em branco.
  const base = b.replace(/[\r\n]+$/, "");
  return { texto: base ? `${base}\n${faltam.join("\n")}` : faltam.join("\n"), conflito: true };
}

/** Tira cada linha de `linhas` uma vez (a primeira ocorrência de cada). */
export function tirarLinhas(texto, linhas) {
  return (linhas ?? []).reduce((t, linha) => tirarLinha(t, -1, linha), String(texto ?? ""));
}
