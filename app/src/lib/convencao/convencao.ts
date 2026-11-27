// Os itens da Convenção do Condomínio Diduccio que servem de base para
// notificação e multa. Texto FICTÍCIO de demonstração, o mesmo de integral.ts:
// quando o Diduccio tiver a convenção registrada, os itens de verdade entram
// aqui, com o texto literal.
//
// O TEXTO é o que a tela mostra e o que vai para a carta: a IA só escolhe
// QUAIS itens (pela `ref`), e nunca escreve o texto de um artigo.
//
// `palavras` é o vocabulário do dia a dia de quem descreve a infração
// ("barulho", "cachorro"), que a convenção não usa. Serve à busca local, que
// é a reserva quando a IA não responde e o que roda na demonstração.


export const FONTE = "Convenção do Condomínio Diduccio";

/**
 * Um item que fundamenta a infração: da Convenção (fixo, abaixo) ou uma
 * decisão de assembleia (lida das atas no banco, `decisoesDasAtas`). Os da
 * assembleia trazem `cita` e `rotulo` próprios; os da Convenção usam `citacao`.
 */
export interface Artigo { ref: string; tema: string; palavras: string; texto: string; cita?: string; rotulo?: string }
export type Sugestao = Artigo & { motivo: string };

export const ARTIGOS: Artigo[] = [
  { ref: "2.2 a)", tema: "Sossego", palavras: "barulho som alto musica festa grito ruido madrugada noite vizinho", texto: "produzir ruídos que perturbem o sossego dos vizinhos, em especial entre 22h e 8h;" },
  { ref: "2.2 b)", tema: "Fachada", palavras: "roupa varal janela varanda tapete pendurar estender", texto: "estender roupas, tapetes ou objetos nas janelas e varandas voltadas para a fachada;" },
  { ref: "2.2 c)", tema: "Fachada", palavras: "fachada varanda fechamento vidro cor esquadria pintura", texto: "alterar a fachada, a cor das esquadrias ou fechar as varandas sem aprovação da assembleia;" },
  { ref: "2.2 d)", tema: "Lixo", palavras: "lixo cigarro bituca jogar janela objeto arremessar", texto: "lançar lixo, pontas de cigarro ou qualquer objeto pelas janelas." },
  { ref: "3.2", tema: "Animais", palavras: "cachorro cao gato animal pet coleira guia coco fezes dejetos latido", texto: "Nas áreas comuns os animais circulam no colo ou na guia, e o tutor recolhe os dejetos." },
  { ref: "4.1", tema: "Obras", palavras: "obra reforma barulho furadeira martelo horario domingo feriado", texto: "Obras nas unidades acontecem de segunda a sexta, das 9h às 17h, e aos sábados, das 9h às 13h, com aviso prévio à administração." },
  { ref: "4.2", tema: "Obras", palavras: "entulho caçamba saco obra resto material corredor", texto: "O entulho é retirado em caçamba ou sacos próprios, nunca deixado nas áreas comuns." },
  { ref: "5.2", tema: "Garagem", palavras: "vaga garagem estacionar carro moto lugar errado deposito", texto: "É vedado estacionar fora da vaga demarcada, ocupar a vaga de outra unidade ou usar a garagem como depósito." },
  { ref: "6.2", tema: "Piscina", palavras: "piscina carteirinha exame horario uso convidado", texto: "A piscina funciona das 8h às 22h, e o uso depende da carteirinha válida, com exame médico em dia." },
  { ref: "6.3", tema: "Áreas comuns", palavras: "salao churrasqueira dano quebra sujeira convidado festa", texto: "O morador que reserva um espaço responde pelos danos causados por ele e pelos seus convidados." },
  { ref: "7.1", tema: "Mudanças", palavras: "mudanca caminhao horario agendar agendamento", texto: "Mudanças são agendadas com a administração e acontecem de segunda a sábado, das 8h às 18h." },
];

const normalizar = (s: unknown): string => String(s ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9 ]+/g, " ");

// Palavras que aparecem em toda descrição e não dizem nada do motivo.
const VAZIAS = new Set(("a o e de da do das dos em no na nos nas um uma com por para que se ao aos " +
  "foi era ser sem mais muito pela pelo apartamento unidade morador moradora condominio bloco " +
  "hoje ontem dia horas hora vez vezes esta este isso").split(" "));

/** "Convenção do Condomínio Diduccio, item 16.3 (xviii)". */
export function citacao(ref: string): string {
  return `${FONTE}, item ${ref}`;
}

/** A citação de qualquer item: a da decisão de assembleia, ou a da Convenção. */
export function citacaoDo(item: Artigo): string {
  return item.cita || citacao(item.ref);
}

/**
 * As decisões das atas de assembleia como itens que fundamentam infração.
 *
 * Uma assembleia pode mudar ou completar a regra da Convenção (o horário de
 * silêncio, o limite de visitantes, uma proibição nova), e a notificação tem
 * que se apoiar no que vale hoje. Cada decisão vira um item com referência
 * própria ("ata-12-2"), que a IA pode escolher como escolhe os da Convenção, e
 * com o texto literal gravado na ata.
 *
 * `decisoes` vem do banco como texto JSON (a coluna é a mesma que a ação
 * perguntar-atas lê).
 */
// deno-lint-ignore no-explicit-any
export function decisoesDasAtas(atas: any[]): Artigo[] {
  const lista = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.map(String);
    try { const p = JSON.parse(String(v ?? "[]")); return Array.isArray(p) ? p.map(String) : []; }
    catch { return []; }
  };
  const itens: Artigo[] = [];
  for (const a of atas ?? []) {
    const data = String(a?.data_assembleia ?? "").trim();
    const titulo = String(a?.titulo ?? "").trim();
    lista(a?.decisoes).forEach((d, k) => {
      const texto = d.trim();
      if (texto.length < 10) return;
      const quando = data ? ` de ${data}` : "";
      itens.push({
        ref: `ata-${a?.id ?? "x"}-${k + 1}`,
        tema: `Assembleia${quando}${titulo ? `: ${titulo}` : ""}`,
        // A própria decisão serve de vocabulário: ela já é escrita na língua
        // de quem descreve ("cortina de vidro", "som"), e é a regra mais nova.
        palavras: texto,
        texto,
        rotulo: `Assembleia${quando}, decisão ${k + 1}`,
        cita: `Ata da assembleia${quando}${titulo ? ` (${titulo})` : ""}, decisão ${k + 1}`,
      });
    });
  }
  return itens;
}

/**
 * A busca local: pontua cada item pelas palavras da descrição que aparecem
 * nas `palavras` (peso maior) e no texto do item. Sem rede e sem custo; é a
 * reserva da IA e o que roda na demonstração.
 */
export function buscarPorPalavras(descricao: string, limite = 3, decisoes: Artigo[] = []): Sugestao[] {
  const termos = [...new Set(normalizar(descricao).split(/\s+/))]
    .filter((t) => t.length >= 3 && !VAZIAS.has(t));
  if (!termos.length) return [];
  const pontuados = [...ARTIGOS, ...decisoes].map((a) => {
    const chaves = ` ${normalizar(a.palavras)} `;
    const texto = ` ${normalizar(a.texto)} `;
    let pontos = 0;
    for (const t of termos) {
      // Prefixo, para "barulhento" casar com "barulho" e "fumando" com "fumar".
      const raiz = t.length > 5 ? t.slice(0, 5) : t;
      if (chaves.includes(` ${t} `)) pontos += 3;
      else if (chaves.includes(` ${raiz}`)) pontos += 2;
      if (texto.includes(` ${raiz}`)) pontos += 1;
    }
    return { artigo: a, pontos };
  });
  return pontuados
    .filter((p) => p.pontos >= 2)
    .sort((x, y) => y.pontos - x.pontos)
    .slice(0, limite)
    .map((p) => ({ ...p.artigo, motivo: "" }));
}

/** A instrução da IA: ela escolhe refs de uma lista fechada, e só isso. */
export function instrucaoParaSugerir(descricao: string, decisoes: Artigo[] = []): string {
  // Os 20 itens mais prováveis pela busca local, e não os ~70: a pergunta
  // menor responde mais rápido. Sem nenhum candidato (descrição com palavras
  // que a busca não conhece), vai a lista inteira para a IA decidir.
  const candidatos = buscarPorPalavras(descricao, 20);
  const itens = candidatos.length ? candidatos : ARTIGOS;
  const lista = itens.map((a) => `[${a.ref}] (${a.tema}) ${a.texto}`).join("\n");
  const dasAtas = decisoes.length
    ? `\n\nDECISÕES DE ASSEMBLEIA (valem junto com a Convenção; uma decisão mais nova pode mudar ou completar a regra):\n` +
      decisoes.map((d) => `[${d.ref}] (${d.tema}) ${d.texto}`).join("\n").slice(0, 30000)
    : "";
  return (
    "Você ajuda a administração do Condomínio Diduccio a fundamentar uma notificação ou multa. " +
    "Abaixo estão itens da Convenção do condomínio e decisões de assembleia, cada um com sua referência entre colchetes. " +
    "Leia a descrição da infração e escolha de 1 a 3 itens que melhor fundamentam a notificação, do mais ao menos pertinente. " +
    "Se uma decisão de assembleia tratar do mesmo assunto, inclua-a: ela mostra a regra como vale hoje. " +
    "Use SOMENTE referências da lista; nunca invente item. Se nenhum item servir, retorne lista vazia. " +
    'Retorne SOMENTE um JSON válido, sem markdown e sem crases, no formato {"itens":[{"ref":"16.3 (xviii)","motivo":"frase curta em português explicando por que"}]}.\n\n' +
    `DESCRIÇÃO DA INFRAÇÃO:\n${String(descricao ?? "").slice(0, 2000)}\n\nITENS DA CONVENÇÃO:\n${lista}${dasAtas}`
  );
}

/**
 * Lê a resposta da IA e devolve só itens que existem, com o texto literal da
 * convenção (nunca o da IA). Resposta ilegível devolve null, para quem chama
 * cair na busca local.
 */
export function lerSugestao(resposta: unknown, decisoes: Artigo[] = []): Sugestao[] | null {
  const todos = [...ARTIGOS, ...decisoes];
  const limpo = String(resposta ?? "").replace(/```json|```/gi, "").trim();
  // deno-lint-ignore no-explicit-any
  let dados: any;
  try {
    dados = JSON.parse(limpo.slice(limpo.indexOf("{"), limpo.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
  const itens = Array.isArray(dados?.itens) ? dados.itens : null;
  if (!itens) return null;
  const vistos = new Set();
  const saida: Sugestao[] = [];
  for (const i of itens) {
    const artigo = todos.find((a) => a.ref === String(i?.ref ?? "").trim());
    if (!artigo || vistos.has(artigo.ref)) continue;
    vistos.add(artigo.ref);
    saida.push({ ...artigo, motivo: String(i?.motivo ?? "").slice(0, 240) });
    if (saida.length === 3) break;
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Redigir a notificação: a pessoa conta o caso do jeito dela e a IA devolve o
// parágrafo formal da carta (o que vem depois de "consistente em:") e, na
// mesma resposta, os itens que o fundamentam. Uma chamada só: as duas coisas
// saem do mesmo texto, e esperar duas IAs em fila dobraria o tempo.

/** A instrução da redação. O texto da carta em volta (saudação, assinatura) já existe. */
export function instrucaoParaRedigir(pedido: string, tipo: string, decisoes: Artigo[] = []): string {
  const multa = String(tipo).toUpperCase() === "MULTA";
  const candidatos = buscarPorPalavras(pedido, 20, decisoes);
  const itens = candidatos.length ? candidatos : [...ARTIGOS, ...decisoes];
  const lista = itens.map((a) => `[${a.ref}] (${a.tema}) ${a.texto}`).join("\n").slice(0, 40000);
  return (
    `Você redige ${multa ? "o motivo de uma multa" : "uma notificação de infração"} do Condomínio Diduccio. ` +
    "A pessoa da administração descreveu o caso de forma informal. Escreva o parágrafo que descreve a infração, " +
    'que entra na carta logo depois da frase "venho por meio desta NOTIFICAR Vossa Senhoria acerca da infração, consistente em:". ' +
    "Regras: tom formal, respeitoso e objetivo, em português do Brasil; de 1 a 3 frases; terceira pessoa; " +
    "sem saudação, sem assinatura, sem título; não cite artigo nem item da convenção no texto; " +
    "NÃO invente fatos que não estão no pedido (data, hora, local exato, placa, nomes, quantidade): se faltarem, escreva sem eles; " +
    "não use travessão; não use adjetivos acusatórios. " +
    "Depois escolha de 0 a 3 itens da lista abaixo que fundamentam a infração, usando SOMENTE referências da lista. " +
    'Retorne SOMENTE um JSON válido, sem markdown e sem crases: {"descricao":"o parágrafo","itens":[{"ref":"7.2","motivo":"frase curta"}]}.\n\n' +
    `PEDIDO DA ADMINISTRAÇÃO:\n${String(pedido ?? "").slice(0, 1500)}\n\nITENS:\n${lista}`
  );
}

/**
 * Lê a redação da IA. A descrição é limpa (sem crases, sem travessão, com
 * tamanho limite); os itens passam pelo mesmo filtro de `lerSugestao`, com o
 * texto literal. Sem descrição legível devolve null.
 */
export function lerRedacao(resposta: unknown, decisoes: Artigo[] = []): { descricao: string; itens: Sugestao[] } | null {
  const limpo = String(resposta ?? "").replace(/```json|```/gi, "").trim();
  // deno-lint-ignore no-explicit-any
  let dados: any;
  try {
    dados = JSON.parse(limpo.slice(limpo.indexOf("{"), limpo.lastIndexOf("}") + 1));
  } catch {
    return null;
  }
  const descricao = String(dados?.descricao ?? "")
    .replace(/\s*[\u2014\u2013]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1500);
  if (descricao.length < 10) return null;
  const itens = lerSugestao(JSON.stringify({ itens: Array.isArray(dados?.itens) ? dados.itens : [] }), decisoes) ?? [];
  return { descricao, itens };
}
