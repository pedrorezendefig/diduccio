/**
 * A planta do condomínio, e onde está cada pessoa que entrou.
 *
 * Implantação de miolo aberto: os seis blocos em volta, o pátio no meio com o
 * nome do condomínio, e o salão de festas fechando embaixo. Escolhida entre
 * cinco propostas.
 *
 * A LEITURA É A ORDEM DOS BLOCOS, e ela dá uma volta no pátio: o 1 fica na
 * lateral esquerda, o 2 sobe para o alto dela, o 3, o 4 e o 5 seguem pela
 * fileira de cima, e o 8 desce pela direita. Quem procura o bloco 3 acompanha o
 * caminho em vez de varrer o desenho — e é isso que separa um mapa que se lê de
 * relance de um que se decifra.
 *
 * Não é levantamento topográfico: é orientação. Cada área foi dimensionada
 * para caber gente dentro, porque um retângulo fiel e estreito não comporta os
 * pinos e o mapa vira enfeite.
 *
 * Coordenadas em porcentagem. Porcentagem e não pixel porque a planta encolhe
 * junto com a tela do celular, e a posição relativa é a única coisa que precisa
 * sobreviver a isso.
 */

import { minutosRestantes } from "./portaria";

/** Sem prazo: hóspede de temporada e prestador. Fica, e não há o que contar. */
export const SEM_PRAZO = "sem-prazo";
/** Com prazo correndo. Amarelo piscando: alguém está com o relógio contra. */
export const NO_PRAZO = "no-prazo";
/** Passou do combinado. Vermelho piscando. */
export const ESTOURADO = "estourado";

/**
 * `tipo` decide o desenho, não o comportamento:
 *   bloco  — os seis prédios; recebem gente e têm contagem
 *   patio  — o miolo aberto, com o nome do condomínio. Recolhe quem entrou sem
 *            apartamento de destino: o prestador do próprio condomínio está no
 *            pátio, e não em bloco nenhum
 *   lazer  — salão de festas e churrasqueira, que também recebem gente em dia
 *            de festa
 */
export const ZONAS = [
  { id: "1", rotulo: "Bloco 1", tipo: "bloco", x: 3,  y: 28, w: 19, h: 40 },
  { id: "2", rotulo: "Bloco 2", tipo: "bloco", x: 3,  y: 4,  w: 21, h: 20 },
  { id: "3", rotulo: "Bloco 3", tipo: "bloco", x: 27, y: 4,  w: 21, h: 20 },
  { id: "4", rotulo: "Bloco 4", tipo: "bloco", x: 51, y: 4,  w: 21, h: 20 },
  { id: "5", rotulo: "Bloco 5", tipo: "bloco", x: 75, y: 4,  w: 22, h: 20 },
  { id: "8", rotulo: "Bloco 8", tipo: "bloco", x: 78, y: 28, w: 19, h: 40 },
  // O miolo leva o nome do condomínio. Ele também é
  // onde ficam as pessoas que entraram sem apartamento de destino — o prestador
  // do próprio condomínio está no pátio, e não em bloco nenhum.
  { id: "COMUM", rotulo: "Diduccio",
                                tipo: "patio", x: 26, y: 30, w: 46, h: 34 },
  { id: "SALAO", rotulo: "Salão de festas", nota: "churrasqueira",
                                tipo: "lazer", x: 3,  y: 72, w: 94, h: 23 },
];

/** Os seis blocos que existem: não há 6 nem 7. */
export const BLOCOS_NO_MAPA = ZONAS.filter((z) => z.tipo === "bloco").map((z) => z.id);

/** Zona que recolhe quem entrou sem apartamento de destino. */
export const ZONA_SEM_DESTINO = "COMUM";

/**
 * O bloco vem como texto e nem sempre do mesmo lugar: a tela grava "5", a
 * planilha migrada tem linha com "Bloco 5" e outra com "05". Fica só o número,
 * sem zero à esquerda — senão a mesma pessoa cairia em zona nenhuma por causa
 * do formato em que o bloco dela foi digitado há dois anos.
 */
function numeroDoBloco(valor) {
  const digitos = String(valor ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return digitos;
}

/** Em que zona da planta esta chegada aparece. */
export function zonaDaChegada(chegada) {
  const bloco = numeroDoBloco(chegada?.bloco);
  return BLOCOS_NO_MAPA.includes(bloco) ? bloco : ZONA_SEM_DESTINO;
}

/**
 * Cor do pino.
 *
 * Foi o pedido, exatamente: quem tem prazo pisca amarelo, e vermelho quando o
 * tempo esgota. Quem não tem prazo não pisca — piscar tudo é o mesmo que não
 * piscar nada.
 */
export function estadoDoPino(chegada, agora = Date.now()) {
  const restam = minutosRestantes(chegada, agora);
  if (restam === null) return SEM_PRAZO;
  return restam < 0 ? ESTOURADO : NO_PRAZO;
}

/** Iniciais para caber no pino. Duas letras: a primeira e a do último nome. */
export function iniciais(nome) {
  const partes = String(nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] ?? "" : "";
  return (primeira + ultima).toUpperCase();
}

// Estourado primeiro, depois quem está mais perto de estourar, e por último
// quem não tem prazo. O pino que interessa é o que já está no limite; deixá-lo
// no fim da fila esconderia justamente o motivo de olhar o mapa.
const PESO = { [ESTOURADO]: 0, [NO_PRAZO]: 1, [SEM_PRAZO]: 2 };

/**
 * A planta inteira, com quem está em cada zona.
 *
 * Devolve TODAS as zonas, inclusive as vazias e as decorativas: quem desenha
 * precisa do salão e da portaria na tela mesmo sem ninguém neles, senão o
 * porteiro não reconhece a planta do próprio condomínio.
 */
export function distribuirNoMapa(chegadas, agora = Date.now()) {
  const porZona = new Map(ZONAS.map((z) => [z.id, []]));

  for (const c of chegadas ?? []) {
    const zona = zonaDaChegada(c);
    const lista = porZona.get(zona);
    if (!lista) continue;
    lista.push({
      chegada: c,
      estado: estadoDoPino(c, agora),
      restam: minutosRestantes(c, agora),
    });
  }

  for (const lista of porZona.values()) {
    lista.sort((a, b) => (PESO[a.estado] - PESO[b.estado]) || ((a.restam ?? 0) - (b.restam ?? 0)));
  }

  return ZONAS.map((z) => ({ ...z, pessoas: porZona.get(z.id) ?? [] }));
}

/**
 * Quantos pinos um bloco mostra antes de resumir o resto num "+N".
 *
 * Existe porque a alternativa era pior: com rolagem dentro do bloco, o pino que
 * pisca some atrás de uma barra de rolagem de 70 pixels que ninguém vai usar —
 * e o mapa passa a esconder justamente o que ele existe para mostrar. Seis
 * cabem nos blocos menores sem apertar; acima disso, o "+N" diz que tem mais e
 * a lista de baixo diz quem.
 */
export const PINOS_VISIVEIS = 6;

/**
 * Divide a gente de uma zona entre os pinos que aparecem e o resto.
 *
 * Quando sobra, mostra um pino a menos: o "+N" ocupa o lugar de um deles, e sem
 * isso a fila cresceria em vez de encurtar. A lista já vem com o mais urgente
 * na frente, então quem fica de fora é sempre quem menos precisa aparecer.
 */
export function pinosDaZona(pessoas = []) {
  if (pessoas.length <= PINOS_VISIVEIS) return { mostrar: pessoas, sobra: 0 };
  const cabem = PINOS_VISIVEIS - 1;
  return { mostrar: pessoas.slice(0, cabem), sobra: pessoas.length - cabem };
}

/** Quantos em cada estado. É o que a legenda mostra. */
export function contarPorEstado(chegadas, agora = Date.now()) {
  const conta = { [SEM_PRAZO]: 0, [NO_PRAZO]: 0, [ESTOURADO]: 0 };
  for (const c of chegadas ?? []) conta[estadoDoPino(c, agora)] += 1;
  return conta;
}
