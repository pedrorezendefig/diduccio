/**
 * O caminho de uma TAG, e até onde a portaria empurra.
 *
 *   Solicitado  o porteiro PEDE. É o único status com que ele consegue criar.
 *   Disponivel  a administração diz que a TAG física chegou. Não é dele.
 *   Aplicado    o porteiro COLA a TAG no carro e marca. É dele — ele é quem
 *               está no portão com o adesivo na mão.
 *
 * Esta regra existe DUAS vezes de propósito: aqui, para a tela não oferecer o
 * que vai ser recusado; e no 0038, que é quem recusa de verdade. Esconder opção
 * não protege nada sozinho — com o próprio token, a pessoa chama a API pelo
 * DevTools. O que a tela evita é o porteiro escolher e perder o trabalho no
 * botão de salvar.
 */

export const SOLICITADO = "Solicitado";
export const DISPONIVEL = "Disponivel";
export const APLICADO = "Aplicado";

/**
 * Esta TAG está ao alcance desta pessoa agora?
 *
 * A administração alcança sempre. O porteiro, só quando a TAG está
 * 'Disponivel' — o adesivo chegou e está com ele. Antes disso o pedido é da
 * administração; depois, já acabou.
 *
 * O par disto no banco é o `using` da política de UPDATE do 0039, que é quem
 * recusa de verdade. Aqui é só para o botão de editar não aparecer numa linha
 * em que ele vai dar erro.
 */
export const podeMexerNaTag = ({ livre, status } = {}) =>
  Boolean(livre) || String(status ?? "") === DISPONIVEL;

/**
 * Os status que esta pessoa pode escolher agora.
 *
 * `livre` é a administração: ela escolhe qualquer um, sempre. Para o porteiro:
 *
 *   criando   só Solicitado.
 *   editando  o que já está lá (para quem só veio corrigir o veículo) e
 *             Aplicado. E ele só chega a editar uma TAG 'Disponivel' — ver
 *             `podeMexerNaTag` —, então na prática é Disponivel ou Aplicado.
 *
 * A ordem da lista original é preservada — ela é a ordem do caminho, e embaralhá-la
 * faria o <select> mudar de ordem conforme o cargo.
 */
export function statusQuePodeEscolher(todos, { livre, editando, atual } = {}) {
  const lista = todos ?? [];
  if (livre) return lista;
  if (!editando) return lista.filter((s) => s.value === SOLICITADO);
  return lista.filter((s) => s.value === atual || s.value === APLICADO);
}

/** Uma opção só não é escolha: o campo mostra o valor e não abre. */
export const escolhaTravada = (opcoes) => (opcoes?.length ?? 0) <= 1;

/** Os dois tipos de solicitante. O `value` vai sem acento porque é ele que o
 *  `check` do 0041 compara; o acento é assunto de quem lê a tela. */
export const TIPOS_SOLICITANTE = [
  { value: "Proprietario", label: "Proprietário" },
  { value: "Inquilino", label: "Inquilino" },
];

/**
 * A placa, o modelo e a cor DESTE veículo, tirados da vaga.
 *
 * Devolve `null` quando a unidade não tem esse veículo registrado — e é a
 * resposta útil, não um erro: foi o pedido ("o veículo tem que estar cadastrado
 * na tela anterior"). Pedir TAG de carro para uma unidade que só tem moto
 * produziria um adesivo para uma placa que ninguém sabe qual é.
 *
 * A vaga guarda carro e moto na MESMA linha desde o 0001, em colunas paralelas.
 * É feio, e mudar isso é outra migração; o que dá para fazer é que a feiura
 * pare aqui, e o resto da tela só pergunte "qual é o veículo?".
 */
export function veiculoDaVaga(vaga, veiculo) {
  if (!vaga) return null;
  const carro = String(veiculo ?? "") === "Carro";
  const possui = carro ? vaga.possui_carro : vaga.possui_moto;
  if (String(possui ?? "") !== "Sim") return null;

  const limpo = (v) => String(v ?? "").trim();
  return {
    placa: limpo(carro ? vaga.placa_carro : vaga.placa_moto),
    modelo: limpo(carro ? vaga.modelo_carro : vaga.modelo_moto),
    cor: limpo(carro ? vaga.cor_carro : vaga.cor_moto),
  };
}

/** "GOL PRATA · ABC1D23" — o veículo numa linha, sem sobrar separador quando
 *  algum campo está em branco. */
export const descreverVeiculo = (dados) => {
  if (!dados) return "";
  const nome = [dados.modelo, dados.cor].filter(Boolean).join(" ");
  return [nome, dados.placa].filter(Boolean).join(" · ");
};
