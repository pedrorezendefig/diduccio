/**
 * Notificações e multas por descumprimento de norma condominial.
 *
 * A regra que este arquivo existe para sustentar: a cada 2 notificações SOBRE O
 * MESMO MOTIVO, a 3ª infração desse motivo é multa (0075). Sem prazo de
 * validade: notificação de dois anos atrás continua contando enquanto não vier
 * a multa que fecha o ciclo daquele motivo.
 *
 * O motivo é uma CADEIA declarada por quem cadastra: a primeira notificação é a
 * raiz, e cada reincidência aponta para ela em `id_reincidencia_de`. O sistema
 * não adivinha que duas descrições falam da mesma coisa.
 *
 * A âncora continua sendo a UNIDADE. O condômino responde pelos atos de quem
 * mora e de quem visita a unidade, então trocar de inquilino não zera o
 * histórico.
 */

const celula = (linha, chave) => {
  if (!linha) return "";
  const alvo = String(chave).toLowerCase();
  const achada = Object.keys(linha).find((k) => k.toLowerCase() === alvo);
  return achada ? linha[achada] : "";
};

export const NOTIFICACAO = "NOTIFICACAO";
export const MULTA = "MULTA";

/** Quantas notificações bastam para a próxima infração virar multa. */
export const LIMITE = 2;

export const DESTINATARIOS_EMAIL = [
  "administradora@diduccio.com.br",
  "sindico@diduccio.com.br",
];

/**
 * O envio pelo sistema (0077, função `enviar-notificacao`). Os endereços moram
 * aqui e são repetidos na função do servidor, que é quem de fato os usa: a
 * tela só mostra o que vai acontecer.
 */
export const DESTINATARIOS_FIXOS = [
  { email: "administradora@diduccio.com.br", rotulo: "Administradora" },
  { email: "sindico@diduccio.com.br", rotulo: "Síndico (Marcos)" },
];
export const REMETENTE_NOTIFICACAO = "notificacao@diduccio.com.br";
export const REMETENTE_MULTA = "adm@diduccio.com.br";
// A cópia oculta de todo envio (o Gmail do condomínio) NÃO mora aqui: este
// arquivo vai no JavaScript do navegador, que qualquer um baixa, e o endereço
// tem que continuar oculto. Ele fica só na função do servidor (envio.ts), que
// também o tira do "Para" se alguém o digitar.
export const RESPONDER_PARA = ["adm@diduccio.com.br", "sindico@diduccio.com.br"];
/** Teto de destinatários visíveis por envio: mais que isso é engano. */
export const MAXIMO_DESTINATARIOS = 10;

/** E-mail com forma de e-mail. Não confere se a caixa existe: isso só o envio diz. */
export function emailValido(valor) {
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]{2,}$/.test(String(valor ?? "").trim());
}

/**
 * A lista inicial do envio: os fixos, marcados, e o e-mail do morador quando o
 * cadastro tem. Na notificação o morador vem marcado (a carta é para ele); na
 * multa, desmarcado: o texto é um pedido à administradora, e quem envia decide.
 */
export function destinatariosIniciais(tipo, emailDoMorador) {
  const lista = DESTINATARIOS_FIXOS.map((d) => ({ ...d, marcado: true, fixo: true }));
  const email = String(emailDoMorador ?? "").trim().toLowerCase();
  if (emailValido(email) && !lista.some((d) => d.email === email)) {
    lista.push({ email, rotulo: "Morador (cadastro)", marcado: String(tipo).toUpperCase() !== MULTA, fixo: false });
  }
  return lista;
}

/**
 * Nome do PDF da carta anexado ao e-mail: "notificacao-bloco-1-unidade-108.pdf".
 * O mesmo nome que a função do servidor dá (envio.ts, `nomeDaCarta`).
 */
export function nomeDaCarta(idUnidade) {
  const rotulo = rotuloDaUnidade(idUnidade).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return `notificacao-${rotulo.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;
}

/** Os e-mails marcados, sem repetição e em minúsculas. */
export function emailsMarcados(lista) {
  return [...new Set((lista ?? []).filter((d) => d.marcado).map((d) => String(d.email).trim().toLowerCase()))];
}

export const CONDOMINIO = "Diduccio";
export const SINDICO = "Marcos Aurélio Pinto";
export const CIDADE = "Rio de Janeiro - RJ";

/**
 * Quem assina o PEDIDO DE MULTA à administradora. A carta de notificação
 * continua do síndico (art. 1.348 do Código Civil: notificar é ato dele); o
 * pedido de multa é rotina administrativa e sai pela auxiliar.
 */
export const ASSINA_MULTA = "Nayra Brito";
export const CARGO_ASSINA_MULTA = `Auxiliar Administrativo do ${CONDOMINIO}`;

const LACUNA = "[                    ]";

/** "R$ 150,00", ou a lacuna quando o valor não foi informado. */
export function valorDaMulta(valor) {
  const n = Number(valor);
  if (valor === null || valor === undefined || valor === "" || !Number.isFinite(n) || n <= 0) return LACUNA;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const tipoDe = (r) => String(celula(r, "tipo") || "").trim().toUpperCase();
const quando = (r) => celula(r, "created_at") || "";

/**
 * O histórico de uma unidade, do mais novo para o mais velho.
 *
 * Ordena por `created_at` e não pela ordem em que o banco devolveu: sem
 * `order by` explícito o Postgres não promete ordem nenhuma, e a contagem
 * abaixo depende de saber qual é a última multa.
 */
export function historicoDaUnidade(registros, idUnidade) {
  if (idUnidade === null || idUnidade === undefined || idUnidade === "") return [];
  return (registros ?? [])
    .filter((r) => String(celula(r, "id_unidade")) === String(idUnidade))
    .slice()
    .sort((a, b) => String(quando(b)).localeCompare(String(quando(a))));
}

/**
 * A cadeia (o motivo) de um registro: o id da raiz. A raiz é a própria cadeia;
 * a reincidência carrega o id da raiz em `id_reincidencia_de`.
 */
export function cadeiaDe(registro) {
  const origem = celula(registro, "id_reincidencia_de");
  return String(origem === null || origem === undefined || origem === "" ? celula(registro, "id") : origem);
}

/** Os registros de uma cadeia, do mais novo para o mais velho. */
export function registrosDaCadeia(registros, idUnidade, idCadeia) {
  if (idCadeia === null || idCadeia === undefined || idCadeia === "") return [];
  return historicoDaUnidade(registros, idUnidade).filter((r) => cadeiaDe(r) === String(idCadeia));
}

/**
 * Notificações em aberto de um motivo: as que vieram DEPOIS da última multa
 * daquele motivo.
 *
 * A multa fecha o ciclo. Sem isso, "a cada 2" viraria "as 2 primeiras da
 * história do motivo", e a partir da terceira toda infração seria multa para
 * sempre, que não é o que a regra diz.
 *
 * Sem cadeia (infração que não é reincidência de nada), não há o que contar: é
 * a primeira do seu motivo.
 */
export function notificacoesEmAberto(registros, idUnidade, idCadeia) {
  const emAberto = [];
  for (const r of registrosDaCadeia(registros, idUnidade, idCadeia)) {
    if (tipoDe(r) === MULTA) break;
    if (tipoDe(r) === NOTIFICACAO) emAberto.push(r);
  }
  return emAberto;
}

/** A próxima infração deste motivo, nesta unidade, tem que ser multa? */
export function exigeMulta(registros, idUnidade, idCadeia) {
  return notificacoesEmAberto(registros, idUnidade, idCadeia).length >= LIMITE;
}

/**
 * Os motivos da unidade, para quem cadastra escolher de qual a nova infração é
 * reincidência. Cada um traz a raiz (que dá nome ao motivo), quantas
 * notificações estão em aberto e se a próxima já é multa. O mais recente primeiro.
 */
export function motivosDaUnidade(registros, idUnidade) {
  const porCadeia = new Map();
  for (const r of historicoDaUnidade(registros, idUnidade)) {
    const id = cadeiaDe(r);
    if (!porCadeia.has(id)) porCadeia.set(id, []);
    porCadeia.get(id).push(r);
  }
  const motivos = [];
  for (const [id, lista] of porCadeia) {
    const raiz = lista.find((r) => String(celula(r, "id")) === id);
    // Raiz que não veio na lista (apagada antes da 0075 travar, ou fora da
    // carga) não tem como dar nome ao motivo: fica de fora da escolha.
    if (!raiz || tipoDe(raiz) !== NOTIFICACAO) continue;
    const emAberto = notificacoesEmAberto(registros, idUnidade, id);
    motivos.push({
      id,
      raiz,
      registros: lista,
      ultima: lista[0],
      emAberto: emAberto.length,
      exigeMulta: emAberto.length >= LIMITE,
    });
  }
  return motivos;
}

/**
 * A posição de uma notificação no seu motivo, contando desde a última multa:
 * 1 para a primeira, 2 para a reincidência seguinte. Multa devolve 0.
 */
export function ordemNoMotivo(registros, registro) {
  if (tipoDe(registro) !== NOTIFICACAO) return 0;
  const lista = registrosDaCadeia(registros, celula(registro, "id_unidade"), cadeiaDe(registro)).slice().reverse();
  let ordem = 0;
  for (const r of lista) {
    if (tipoDe(r) === MULTA) ordem = 0;
    else if (tipoDe(r) === NOTIFICACAO) ordem += 1;
    if (String(celula(r, "id")) === String(celula(registro, "id"))) return ordem;
  }
  return ordem;
}

/**
 * As notificações que levaram a este registro: as do mesmo motivo, mais velhas
 * que ele, desde a multa anterior do motivo. É a lista que vai no pedido de
 * multa. Contar "em aberto" depois de salvar não serve: a própria multa já
 * fechou o ciclo e a lista sairia vazia.
 */
export function notificacoesAntesDe(registros, registro) {
  const anteriores = [];
  const quandoDele = String(quando(registro));
  const lista = registrosDaCadeia(registros, celula(registro, "id_unidade"), cadeiaDe(registro));
  for (const r of lista) {
    if (String(celula(r, "id")) === String(celula(registro, "id"))) continue;
    if (String(quando(r)) > quandoDele) continue;
    if (tipoDe(r) === MULTA) break;
    if (tipoDe(r) === NOTIFICACAO) anteriores.push(r);
  }
  return anteriores;
}

/** Um resumo curto da descrição, para nomear o motivo numa lista. */
export function resumoDoMotivo(registro, limite = 90) {
  const texto = String(celula(registro, "descricao") || celula(registro, "assunto") || "").replace(/\s+/g, " ").trim();
  return texto.length > limite ? `${texto.slice(0, limite - 1).trimEnd()}…` : texto;
}

/** "BLOCO 1 - UNIDADE 108" a partir do id da unidade. */
export function rotuloDaUnidade(valor) {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  if (digitos.length < 4) return String(valor ?? "").trim();
  return `BLOCO ${digitos.slice(0, -3)} - UNIDADE ${digitos.slice(-3)}`;
}

/** "01/04/2026" a partir de Date, ISO, ou "2026-04-01". */
export function dataPorExtenso(valor) {
  if (!valor) return "";
  // "2026-04-01" cru vira 31/03 se passar pelo fuso do navegador: `new Date`
  // trata data sem hora como UTC, e o Brasil está três horas atrás.
  const so = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (so) return `${so[3]}/${so[2]}/${so[1]}`;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? String(valor) : d.toLocaleDateString("pt-BR");
}

/**
 * A carta que o morador recebe. Texto do modelo do síndico, com os campos do
 * cadastro no lugar.
 *
 * `emitidaEm` é a data da CARTA, e não a do fato: as duas divergem, e é a de
 * emissão que vale como marco.
 */
export function textoDaNotificacao({
  destinatario, unidade, assunto, descricao, emitidaEm,
} = {}) {
  return [
    `CONDOMÍNIO: ${CONDOMINIO}`,
    `AO SR(A): ${destinatario || ""}`,
    `UNIDADE: ${rotuloDaUnidade(unidade)}`,
    `ASSUNTO: ${assunto || ""}`,
    "",
    "Prezado(a) Senhor(a),",
    "",
    `Na qualidade de síndico do Condomínio ${CONDOMINIO}, no exercício de minhas ` +
      "atribuições (art. 1.348 do Código Civil), venho por meio desta NOTIFICAR " +
      "Vossa Senhoria acerca da infração, consistente em:",
    "",
    descricao || "",
    "",
    "Tal conduta descumpre as normas da Convenção do Condomínio e do Regulamento " +
      "Interno, sendo o morador responsável pelos atos de seus familiares, " +
      "visitantes e prestadores de serviço.",
    "",
    "Solicitamos a cessação imediata da conduta. Ressaltamos que a persistência " +
      "ou a reincidência poderá resultar na aplicação de multa, conforme as " +
      "normas condominiais.",
    "",
    `${CIDADE}, ${dataPorExtenso(emitidaEm)}.`,
    "",
    "Atenciosamente,",
    "",
    SINDICO,
    `Síndico do ${CONDOMINIO}.`,
  ].join("\n");
}

/**
 * A carta em HTML, para o editor abrir com ela.
 *
 * Escapa antes de montar. `descricao` é texto que alguém digitou, e vai daqui
 * direto para dentro de um editor que interpreta HTML: sem escapar, um `<` na
 * descrição de uma infração já basta para o parágrafo sumir da carta impressa.
 */
export function textoParaHtml(texto) {
  const seguro = String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return seguro
    .split("\n")
    // Linha em branco vira parágrafo vazio de propósito: é o espaçamento do
    // modelo, e colapsá-las gruda a assinatura no último parágrafo.
    .map((linha) => `<p>${linha || "<br>"}</p>`)
    .join("");
}

/**
 * O caminho de volta: HTML do editor para texto puro.
 *
 * É o que vai no corpo do e-mail. Sem isto, uma carta editada seria enviada
 * como `<p>Prezado…</p>` — e o que o síndico entregou no papel deixaria de ser
 * o que a administradora recebeu por escrito.
 */
export function htmlParaTexto(html) {
  return String(html ?? "")
    .replace(/<\/p>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    // `&amp;` por último: desfazer antes transformaria "&amp;lt;" em "<".
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A carta pronta para o editor: a salva, se houver; senão a montada na hora. */
export function htmlDaNotificacao(registro, dados) {
  const salvo = String(registro?.texto ?? "").trim();
  return salvo || textoParaHtml(textoDaNotificacao(dados));
}

/** "NOTIFICAÇÃO - BLOCO 1 - UNIDADE 108" */
export function assuntoDoEmail(tipo, unidade) {
  const rotulo = String(tipo).toUpperCase() === MULTA ? "MULTA" : "NOTIFICAÇÃO";
  return `${rotulo} - ${rotuloDaUnidade(unidade)}`;
}

/**
 * O e-mail da multa é um PEDIDO À ADMINISTRADORA, não documento para o morador.
 * Descreve o motivo e traz os dados da multa que quem cadastrou informou
 * (valor, base na convenção, vencimento e forma de cobrança, 0076).
 *
 * Dado que faltar (multa de antes da 0076) sai como lacuna entre colchetes, de
 * propósito: campo em branco faria a frase parecer completa, e alguém enviaria
 * assim.
 */
export function corpoDoEmailDeMulta({
  destinatario, unidade, assunto, descricao, emitidaEm, ocorridoEm,
  notificacoesAnteriores = [],
  valor, base, vencimento, formaCobranca,
} = {}) {
  const texto = (v) => String(v ?? "").trim() || LACUNA;
  // Multa DIRETA: sem notificação anterior do motivo, porque a Convenção ou a
  // lei punem a infração com multa já na primeira vez. Só a multa cadastrada
  // com os dados (0076) pode ser lida assim: uma multa antiga sem vínculo nem
  // valor foi reincidência pela regra de antes, e chamá-la de direta mentiria.
  const direta = !notificacoesAnteriores.length && valorDaMulta(valor) !== LACUNA;
  const anteriores = notificacoesAnteriores.length
    ? notificacoesAnteriores
        .map((n, i) => `  ${i + 1}. ${dataPorExtenso(celula(n, "created_at"))} - ${resumoDoMotivo(n)}`)
        .join("\n")
    : "  (nenhuma registrada no sistema)";

  return [
    `CONDOMÍNIO: ${CONDOMINIO}`,
    `UNIDADE: ${rotuloDaUnidade(unidade)}`,
    `MORADOR: ${destinatario || ""}`,
    `ASSUNTO: ${assunto || ""}`,
    // As duas datas, e nomeadas: a administradora precisa saber quando o fato
    // aconteceu para calcular prazo, e uma linha "DATA" sozinha não diz qual é.
    `DATA DA OCORRÊNCIA: ${dataPorExtenso(ocorridoEm) || "não informada"}`,
    `PEDIDO EMITIDO EM: ${dataPorExtenso(emitidaEm)}`,
    "",
    "Prezados,",
    "",
    direta
      ? "Solicito a aplicação de MULTA à unidade acima, por infração que a " +
        "Convenção, o Regulamento Interno ou a lei punem com multa direta, sem " +
        "notificação prévia."
      : "Solicito a aplicação de MULTA à unidade acima, por reincidência em " +
        "descumprimento de norma condominial.",
    "",
    "MOTIVO:",
    descricao || "",
    "",
    ...(direta
      ? []
      : ["NOTIFICAÇÕES ANTERIORES SOBRE O MESMO MOTIVO:", anteriores, ""]),
    "DADOS DA MULTA:",
    `  Valor da multa: ${valorDaMulta(valor)}`,
    // A base é opcional: sem ela, a linha nem entra no pedido.
    ...(String(base ?? "").trim() ? [`  Base na Convenção / Regulamento: ${String(base).trim()}`] : []),
    `  Vencimento: ${vencimento ? dataPorExtenso(vencimento) : LACUNA}`,
    `  Forma de cobrança: ${texto(formaCobranca)}`,
    "",
    "Atenciosamente,",
    "",
    ASSINA_MULTA,
    `${CARGO_ASSINA_MULTA}.`,
  ].join("\n");
}

/** Os dados que a multa exige no cadastro (0076): valor, vencimento e forma de cobrança. */
export function errosDosDadosDaMulta({ valor, vencimento, formaCobranca } = {}) {
  const e = {};
  const n = Number(String(valor ?? "").replace(",", "."));
  if (!String(valor ?? "").trim() || !Number.isFinite(n) || n <= 0) e.multa_valor = "Informe o valor da multa.";
  // A base na Convenção / Regulamento é opcional: quando falta, o pedido sai
  // com a lacuna entre colchetes para a administradora completar.
  if (!vencimento) e.multa_vencimento = "Informe o vencimento.";
  if (!String(formaCobranca ?? "").trim()) e.multa_forma_cobranca = "Diga como a multa será cobrada.";
  return e;
}

/** O corpo do e-mail de uma notificação é a própria carta. */
export function corpoDoEmail(tipo, dados) {
  return String(tipo).toUpperCase() === MULTA
    ? corpoDoEmailDeMulta(dados)
    : textoDaNotificacao(dados);
}

/**
 * Link que abre o Gmail com tudo preenchido.
 *
 * O sistema não envia: abre o compositor para o síndico conferir e clicar. É o
 * mesmo caminho do WhatsApp das encomendas, e tem uma vantagem que o envio
 * automático não teria — a mensagem fica em "Enviados" na conta de quem mandou,
 * que é onde se procura quando alguém pergunta se foi enviado.
 */
export function linkDoGmail({ para = DESTINATARIOS_EMAIL, assunto = "", corpo = "" } = {}) {
  const lista = (Array.isArray(para) ? para : [para]).filter(Boolean).join(",");
  const q = new URLSearchParams({ view: "cm", fs: "1", to: lista, su: assunto, body: corpo });
  return `https://mail.google.com/mail/?${q.toString()}`;
}

/**
 * Sugestões de destinatário da unidade: os moradores do cadastro (com o id,
 * que liga a notificação ao morador) e, depois, quem usa o app e não está no
 * cadastro (só o nome). Teste e2e de 12/11/2026: o morador do app não
 * aparecia, embora Encomendas o achasse. Nome repetido (sem diferença de
 * maiúsculas, acentos e espaços) fica só uma vez, a do cadastro.
 */
export function sugestoesDeDestinatario(doCadastro = [], nomesNoApp = []) {
  const chave = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ").trim().toLowerCase();
  const vistos = new Set();
  const lista = [];
  for (const m of doCadastro) {
    const nome = String(m?.nome ?? "").trim();
    if (!nome || vistos.has(chave(nome))) continue;
    vistos.add(chave(nome));
    lista.push({ id: m.id ?? "", nome, doApp: false });
  }
  for (const n of nomesNoApp) {
    const nome = String(n ?? "").trim();
    if (!nome || vistos.has(chave(nome))) continue;
    vistos.add(chave(nome));
    lista.push({ id: "", nome, doApp: true });
  }
  return lista;
}
