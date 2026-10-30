/**
 * Que encomendas podem receber baixa numa retirada.
 *
 * A resposta é: só as do cadastro que o porteiro abriu — nunca as outras da
 * mesma unidade.
 *
 * A primeira versão filtrava pela UNIDADE, para o morador que desce buscar um
 * pacote levar de uma vez os outros que chegaram. É cômodo e está errado: a
 * assinatura passa a cobrir encomendas que ninguém conferiu na prateleira. Duas
 * encomendas do 5302 de dias diferentes viravam uma marcação só, e bastava o
 * porteiro não reparar para a segunda constar como entregue sem ter saído. Aí o
 * comprovante — assinado, com CPF, com hora — diz que saiu. Registro que mente
 * é pior que registro nenhum, porque encerra a discussão.
 *
 * Uma retirada, um cadastro. Levar duas encomendas continua possível: são duas
 * baixas, cada uma com a sua assinatura.
 */

const celula = (linha, chave) => {
  if (!linha) return "";
  const alvo = String(chave).toLowerCase();
  const achada = Object.keys(linha).find((k) => k.toLowerCase() === alvo);
  return achada ? linha[achada] : "";
};

/**
 * Status de quem já saiu da portaria.
 *
 * O corte é por status e não por `data_saida`: o histórico migrado da planilha
 * tem linhas com status "Entregue" e data em branco, e elas voltariam a
 * aparecer como pendentes.
 */
export const FORA_DA_PORTARIA = ["ENTREGUE", "RETIRADO"];

export function pendentesDoCadastro(encomendas, idCadastro) {
  // Cadastro nenhum é lista vazia, e não a lista inteira. Sem esta guarda um
  // `undefined` viraria "compara com tudo" na primeira renderização.
  if (idCadastro === null || idCadastro === undefined || idCadastro === "") return [];

  return (encomendas ?? []).filter((e) => {
    if (String(celula(e, "id")) !== String(idCadastro)) return false;
    const status = String(celula(e, "status") || "").trim().toUpperCase();
    return !FORA_DA_PORTARIA.includes(status);
  });
}

/**
 * Que saída preenche o card "Dados de Saída".
 *
 * A regra parece pequena e já errou duas vezes:
 *
 * 1º — lia as colunas de `entregas`, que só são escritas quando a encomenda
 *      FECHA. Numa parcial o card mostrava traço em tudo enquanto uma caixa
 *      acabara de sair assinada.
 * 2º — passou a ler a última saída da ENCOMENDA. Aí trocar para a foto do item
 *      que continua na prateleira mostrava quem levou o outro — pior que o
 *      vazio, porque parecia informação.
 *
 * A regra certa: quando há item na tela, o card fala DELE, e vazio é resposta
 * legítima. Sem item na tela (foto antiga sem vínculo, ou encomenda sem foto),
 * vale a última saída da encomenda — e a coluna dela como reserva, que é o que
 * as linhas migradas da planilha têm.
 *
 * `encomenda` só entra na reserva: usá-la com item na tela é justamente o
 * defeito nº 2.
 */
export function saidaVisivel({ notaNaTela, retiradaDaNota, ultimaSaida, encomenda } = {}) {
  const porItem = Boolean(notaNaTela);
  const retirada = porItem ? (retiradaDaNota ?? null) : (ultimaSaida ?? null);
  const reserva = (chave) => (porItem ? "" : celula(encomenda, chave));

  return {
    retirada,
    porItem,
    nome: celula(retirada, "retirado_por_nome") || reserva("nome_morador"),
    cpf: celula(retirada, "retirado_por_cpf") || reserva("cpf_morador"),
    entreguePor: celula(retirada, "entregue_por") || reserva("entregue_por"),
    quando: celula(retirada, "created_at") || reserva("data_saida"),
    // Sem reserva de propósito: `via` só existe em retirada registrada. Linha
    // migrada da planilha não guarda como o pacote foi conferido, e inventar
    // "código" ali seria afirmar uma conferência que ninguém fez.
    via: celula(retirada, "via"),
  };
}

/**
 * Como a retirada foi conferida, em português.
 *
 * Este campo tomou o lugar do "Cód. Entrega" no card de saída. O código vinha
 * de `entregas.cod`, que o gatilho do 0020 gera na hora de NOTIFICAR — ou seja,
 * aparecia preenchido em encomenda parada na prateleira, dentro de um card que
 * diz "Dados de Saída". Não era dado de saída nenhum.
 *
 * `via` é: `retiradas.via` só existe depois que alguém assinou, e diz o que
 * realmente importa auditar — se o morador provou com o código que recebeu no
 * WhatsApp, ou se o porteiro liberou pela identificação.
 */
export function rotuloVia(via) {
  const v = String(via ?? "").trim().toLowerCase();
  if (v === "codigo") return "Código";
  if (v === "identificacao") return "Identificação";
  return "";
}
