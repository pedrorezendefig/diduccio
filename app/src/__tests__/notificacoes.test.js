// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  NOTIFICACAO, MULTA, LIMITE, DESTINATARIOS_EMAIL, htmlDaNotificacao,
  htmlParaTexto, textoParaHtml,
  historicoDaUnidade, notificacoesEmAberto, exigeMulta,
  motivosDaUnidade, ordemNoMotivo, notificacoesAntesDe, errosDosDadosDaMulta,
  rotuloDaUnidade, dataPorExtenso,
  textoDaNotificacao, corpoDoEmailDeMulta, corpoDoEmail,
  assuntoDoEmail, linkDoGmail,
} from "../lib/notificacoes";

/**
 * A regra (0075): a cada 2 notificações SOBRE O MESMO MOTIVO, a 3ª infração
 * desse motivo é multa.
 *
 * Errar isto não quebra tela nenhuma: só faz o condomínio multar quem não
 * devia, ou deixar de multar quem devia. Os dois são invisíveis até virarem
 * discussão em assembleia, e aí o registro é a única prova que existe.
 *
 * O motivo é declarado por quem cadastra: a reincidência aponta para a primeira
 * notificação do motivo em `id_reincidencia_de`.
 */

const N = (id, unidade, dia, assunto = "assunto", origem = null) => ({
  id, tipo: NOTIFICACAO, id_unidade: unidade, assunto, id_reincidencia_de: origem,
  created_at: `2026-0${dia}-01T12:00:00Z`,
});
const M = (id, unidade, dia, origem = null) => ({
  id, tipo: MULTA, id_unidade: unidade, assunto: "multa", id_reincidencia_de: origem,
  created_at: `2026-0${dia}-01T12:00:00Z`,
});

describe("contagem por motivo", () => {
  it("uma notificação não exige multa", () => {
    expect(exigeMulta([N(1, 1108, 1)], 1108, 1)).toBe(false);
  });

  it("duas notificações do mesmo motivo fazem a próxima desse motivo ser multa", () => {
    expect(exigeMulta([N(1, 1108, 1), N(2, 1108, 2, "x", 1)], 1108, 1)).toBe(true);
  });

  it("duas notificações de motivos diferentes NÃO fazem multa", () => {
    // O motivo da 0075: barulho em março e lixo em maio não são reincidência.
    const tudo = [N(1, 1108, 1, "barulho"), N(2, 1108, 2, "lixo")];
    expect(exigeMulta(tudo, 1108, 1)).toBe(false);
    expect(exigeMulta(tudo, 1108, 2)).toBe(false);
  });

  it("infração sem motivo escolhido é a primeira do seu motivo", () => {
    const tudo = [N(1, 1108, 1), N(2, 1108, 2, "x", 1)];
    for (const vazio of [null, undefined, ""]) {
      expect(notificacoesEmAberto(tudo, 1108, vazio)).toEqual([]);
      expect(exigeMulta(tudo, 1108, vazio)).toBe(false);
    }
  });

  it("a unidade do lado não herda nada", () => {
    // A âncora continua sendo a unidade, mesmo com o id do motivo em mãos.
    const tudo = [N(1, 1108, 1), N(2, 1108, 2, "x", 1)];
    expect(exigeMulta(tudo, 1109, 1)).toBe(false);
    expect(notificacoesEmAberto(tudo, 1109, 1)).toEqual([]);
  });

  it("o tempo não conta: notificação velha continua valendo", () => {
    const antiga = { ...N(1, 1108, 1), created_at: "2019-01-05T09:00:00Z" };
    expect(exigeMulta([antiga, N(2, 1108, 2, "x", 1)], 1108, 1)).toBe(true);
  });
});

describe("a multa fecha o ciclo do motivo", () => {
  it("depois da multa a contagem do motivo recomeça do zero", () => {
    const historico = [N(1, 1108, 1), N(2, 1108, 2, "x", 1), M(3, 1108, 3, 1)];
    expect(notificacoesEmAberto(historico, 1108, 1)).toEqual([]);
    expect(exigeMulta(historico, 1108, 1)).toBe(false);
  });

  it("uma reincidência depois da multa é só a primeira do novo ciclo", () => {
    const historico = [N(1, 1108, 1), N(2, 1108, 2, "x", 1), M(3, 1108, 3, 1), N(4, 1108, 4, "x", 1)];
    expect(notificacoesEmAberto(historico, 1108, 1)).toHaveLength(1);
    expect(exigeMulta(historico, 1108, 1)).toBe(false);
  });

  it("duas depois da multa exigem multa de novo", () => {
    const historico = [
      N(1, 1108, 1), N(2, 1108, 2, "x", 1), M(3, 1108, 3, 1), N(4, 1108, 4, "x", 1), N(5, 1108, 5, "x", 1),
    ];
    expect(exigeMulta(historico, 1108, 1)).toBe(true);
  });

  it("a multa de um motivo não fecha o ciclo de outro", () => {
    const historico = [
      N(1, 1108, 1, "barulho"), N(2, 1108, 2, "x", 1), M(3, 1108, 3, 1),
      N(4, 1108, 4, "lixo"), N(5, 1108, 5, "x", 4),
    ];
    expect(exigeMulta(historico, 1108, 4)).toBe(true);
    expect(exigeMulta(historico, 1108, 1)).toBe(false);
  });
});

describe("os motivos da unidade", () => {
  it("cada notificação sem vínculo é um motivo; as reincidências entram no dela", () => {
    const tudo = [N(1, 1108, 1, "barulho"), N(2, 1108, 2, "lixo"), N(3, 1108, 3, "x", 1)];
    const motivos = motivosDaUnidade(tudo, 1108);
    expect(motivos.map((m) => m.id)).toEqual(["1", "2"]);
    expect(motivos.find((m) => m.id === "1").emAberto).toBe(2);
    expect(motivos.find((m) => m.id === "1").exigeMulta).toBe(true);
    expect(motivos.find((m) => m.id === "2").exigeMulta).toBe(false);
  });

  it("o motivo mais recente vem primeiro", () => {
    const tudo = [N(1, 1108, 1, "barulho"), N(2, 1108, 2, "lixo"), N(3, 1108, 5, "x", 1)];
    expect(motivosDaUnidade(tudo, 1108)[0].id).toBe("1");
  });

  it("a ordem no motivo conta desde a última multa", () => {
    const h = [N(1, 1108, 1), N(2, 1108, 2, "x", 1), M(3, 1108, 3, 1), N(4, 1108, 4, "x", 1)];
    expect(ordemNoMotivo(h, h[0])).toBe(1);
    expect(ordemNoMotivo(h, h[1])).toBe(2);
    expect(ordemNoMotivo(h, h[2])).toBe(0);
    expect(ordemNoMotivo(h, h[3])).toBe(1);
  });

  it("o pedido de multa lista as notificações do motivo que levaram a ela", () => {
    // Depois de salva, a própria multa fecha o ciclo: contar "em aberto" daria
    // lista vazia no e-mail.
    const h = [N(1, 1108, 1, "barulho"), N(9, 1108, 2, "lixo"), N(2, 1108, 3, "x", 1), M(3, 1108, 4, 1)];
    expect(notificacoesAntesDe(h, h[3]).map((r) => r.id)).toEqual([2, 1]);
  });
});

describe("ordem e entradas estranhas", () => {
  it("não confia na ordem em que o banco devolveu", () => {
    // Sem `order by`, o Postgres não promete ordem. Embaralhado, um `break` na
    // primeira multa encontrada cortaria no lugar errado.
    const embaralhado = [N(4, 1108, 4, "x", 1), M(3, 1108, 3, 1), N(1, 1108, 1), N(2, 1108, 2, "x", 1)];
    expect(notificacoesEmAberto(embaralhado, 1108, 1).map((r) => r.id)).toEqual([4]);
  });

  it("aceita ids como número ou como texto", () => {
    expect(exigeMulta([N(1, 1108, 1), N(2, "1108", 2, "x", "1")], "1108", "1")).toBe(true);
  });

  it("sem unidade escolhida não devolve o prédio inteiro", () => {
    const tudo = [N(1, 1108, 1), N(2, 1109, 2)];
    for (const vazio of [null, undefined, ""]) {
      expect(historicoDaUnidade(tudo, vazio)).toEqual([]);
      expect(exigeMulta(tudo, vazio, 1)).toBe(false);
    }
  });

  it("aguenta lista ausente", () => {
    expect(notificacoesEmAberto(undefined, 1108, 1)).toEqual([]);
    expect(motivosDaUnidade(undefined, 1108)).toEqual([]);
  });

  it("o limite é 2, e está escrito num lugar só", () => {
    expect(LIMITE).toBe(2);
    const quase = [N(1, 1108, 1)];
    expect(exigeMulta(quase, 1108, 1)).toBe(false);
    expect(exigeMulta([...quase, N(9, 1108, 9, "x", 1)], 1108, 1)).toBe(true);
  });
});

describe("rótulo da unidade e data", () => {
  it("1108 vira BLOCO 1 - UNIDADE 108", () => {
    expect(rotuloDaUnidade(1108)).toBe("BLOCO 1 - UNIDADE 108");
    expect(rotuloDaUnidade("5206")).toBe("BLOCO 5 - UNIDADE 206");
    expect(rotuloDaUnidade(12108)).toBe("BLOCO 12 - UNIDADE 108");
  });

  it("valor curto sai como veio, em vez de virar bloco vazio", () => {
    expect(rotuloDaUnidade("108")).toBe("108");
    expect(rotuloDaUnidade("")).toBe("");
  });

  it("data ISO sem hora não anda um dia para trás", () => {
    // `new Date("2026-04-01")` é meia-noite UTC, que no Brasil é 31/03 às 21h.
    // Uma carta com a data errada é uma carta com defeito.
    expect(dataPorExtenso("2026-04-01")).toBe("01/04/2026");
    expect(dataPorExtenso("2026-01-01")).toBe("01/01/2026");
  });

  it("data vazia não vira 'Invalid Date' na carta", () => {
    expect(dataPorExtenso("")).toBe("");
    expect(dataPorExtenso(null)).toBe("");
  });
});

describe("a carta da notificação", () => {
  const dados = {
    destinatario: "Teresa",
    unidade: 1108,
    assunto: "Notificação de descumprimento de normas condominiais",
    descricao: "Visitante acessou o condomínio sem identificação na portaria.",
    emitidaEm: "2026-04-01",
  };
  const carta = () => textoDaNotificacao(dados);

  it("traz todos os campos do cadastro", () => {
    const t = carta();
    expect(t).toContain("AO SR(A): Teresa");
    expect(t).toContain("UNIDADE: BLOCO 1 - UNIDADE 108");
    expect(t).toContain(dados.assunto);
    expect(t).toContain(dados.descricao);
    expect(t).toContain("Rio de Janeiro - RJ, 01/04/2026.");
  });

  it("cita o artigo que dá ao síndico o poder de notificar", () => {
    expect(carta()).toContain("art. 1.348 do Código Civil");
  });

  it("avisa que a reincidência vira multa", () => {
    // É o que transforma a carta em notificação de verdade: sem o aviso, a
    // multa seguinte fica sem base.
    expect(carta()).toMatch(/reincid[êe]ncia/i);
    expect(carta()).toMatch(/multa/i);
  });

  it("assina como síndico, e não como quem digitou", () => {
    expect(carta()).toContain("Marcos Aurélio Pinto");
    expect(carta()).toContain("Síndico do Diduccio.");
  });

  it("campo vazio não deixa marcador aparecendo", () => {
    // Uma carta entregue com "undefined" ou "[campo]" no meio é pior que uma
    // carta faltando: parece pronta.
    const t = textoDaNotificacao({});
    expect(t).not.toMatch(/undefined|null|\[.*\]/);
  });
});

describe("o e-mail da multa", () => {
  const dados = {
    destinatario: "Teresa",
    unidade: 1108,
    assunto: "Reincidência em uso indevido de vaga",
    descricao: "Terceira ocorrência de visitante sem identificação.",
    emitidaEm: "2026-04-01",
    notificacoesAnteriores: [N(1, 1108, 1, "Vaga sem identificação"), N(2, 1108, 2, "Ruído")],
  };
  const email = () => corpoDoEmailDeMulta(dados);

  it("descreve o motivo", () => {
    expect(email()).toContain(dados.descricao);
  });

  it("lista as notificações que levaram até aqui", () => {
    // É a justificativa da multa. Sem elas, a administradora recebe um pedido
    // sem lastro e tem que ir procurar no sistema.
    const t = email();
    expect(t).toContain("Vaga sem identificação");
    expect(t).toContain("Ruído");
  });

  it("deixa as lacunas da administração marcadas", () => {
    const t = email();
    for (const campo of ["Valor da multa", "Vencimento", "Forma de cobrança"]) {
      expect(t).toContain(campo);
    }
    // Colchetes visíveis: campo em branco faria a frase parecer completa.
    expect(t).toMatch(/\[\s+\]/);
  });

  it("não inventa valor de multa", () => {
    // O sistema não sabe o valor, e chutar um seria pior que deixar em branco.
    expect(email()).not.toMatch(/R\$\s*\d/);
  });

  it("sem histórico, diz isso em vez de deixar a lista vazia", () => {
    expect(corpoDoEmailDeMulta({ ...dados, notificacoesAnteriores: [] }))
      .toContain("nenhuma registrada");
  });

  describe("com os dados da multa informados no cadastro (0076)", () => {
    const completo = () => corpoDoEmailDeMulta({
      ...dados,
      valor: 150,
      base: "Regulamento Interno, art. 12",
      vencimento: "2026-11-30",
      formaCobranca: "Boleto junto com a cota condominial",
    });

    it("sai preenchido, sem lacunas", () => {
      const t = completo();
      expect(t).toMatch(/Valor da multa: R\$\s?150,00/);
      expect(t).toContain("Base na Convenção / Regulamento: Regulamento Interno, art. 12");
      expect(t).toContain("Vencimento: 30/11/2026");
      expect(t).toContain("Forma de cobrança: Boleto junto com a cota condominial");
      expect(t).not.toMatch(/\[\s+\]/);
    });

    it("o que faltar continua como lacuna, e não some", () => {
      const t = corpoDoEmailDeMulta({ ...dados, valor: 150 });
      expect(t).toMatch(/Valor da multa: R\$\s?150,00/);
      expect(t).toMatch(/Vencimento: \[\s+\]/);
    });

    it("com notificações anteriores, é pedido por reincidência", () => {
      const t = completo();
      expect(t).toMatch(/por reincidência/);
      expect(t).toContain("NOTIFICAÇÕES ANTERIORES SOBRE O MESMO MOTIVO:");
    });

    it("sem notificação anterior, é multa direta e não fala em reincidência", () => {
      const t = corpoDoEmailDeMulta({
        ...dados, notificacoesAnteriores: [], valor: 300, base: "Lei 4.591/64, art. 21",
        vencimento: "2026-12-10", formaCobranca: "Boleto avulso",
      });
      expect(t).toMatch(/multa direta, sem notificação prévia/);
      expect(t).not.toMatch(/reincidência/);
      expect(t).not.toContain("NOTIFICAÇÕES ANTERIORES");
    });

    it("multa antiga sem vínculo nem dados não vira 'direta'", () => {
      // Foi reincidência pela regra de antes da 0075; chamá-la de direta mentiria.
      const t = corpoDoEmailDeMulta({ ...dados, notificacoesAnteriores: [] });
      expect(t).toMatch(/por reincidência/);
      expect(t).toContain("nenhuma registrada");
    });

    it("é assinado pela auxiliar administrativa, e não pelo síndico", () => {
      const t = completo();
      expect(t).toContain("Nayra Brito");
      expect(t).toContain("Auxiliar Administrativo do Diduccio.");
      expect(t).not.toContain("Marcos Aurélio Pinto");
    });
  });

  describe("a multa exige valor, vencimento e forma de cobrança no cadastro", () => {
    it("vazio aponta os três campos; a base na Convenção é opcional", () => {
      expect(Object.keys(errosDosDadosDaMulta({})).sort()).toEqual(
        ["multa_forma_cobranca", "multa_valor", "multa_vencimento"]
      );
    });

    it("sem a base, a linha da base nem entra no pedido", () => {
      const t = corpoDoEmailDeMulta({ valor: 150, vencimento: "2026-11-30", formaCobranca: "PIX" });
      expect(t).not.toContain("Base na Convenção / Regulamento");
      expect(t).toMatch(/Valor da multa: R\$\s?150,00/);
    });

    it("valor zero ou negativo não passa; com vírgula passa", () => {
      const resto = { base: "art. 12", vencimento: "2026-11-30", formaCobranca: "PIX" };
      expect(errosDosDadosDaMulta({ ...resto, valor: "0" })).toHaveProperty("multa_valor");
      expect(errosDosDadosDaMulta({ ...resto, valor: "-10" })).toHaveProperty("multa_valor");
      expect(errosDosDadosDaMulta({ ...resto, valor: "150,50" })).toEqual({});
    });
  });

  it("separa a data do fato da data do pedido, e nomeia as duas", () => {
    // A administradora calcula prazo a partir do FATO. Uma linha "DATA:"
    // sozinha não diz qual das duas é, e as duas quase nunca coincidem.
    const t = corpoDoEmailDeMulta({
      ...dados, ocorridoEm: "2026-03-28", emitidaEm: "2026-04-01T10:00:00Z",
    });
    expect(t).toContain("DATA DA OCORRÊNCIA: 28/03/2026");
    expect(t).toContain("PEDIDO EMITIDO EM: 01/04/2026");
  });

  it("sem data de ocorrência, diz que não foi informada", () => {
    // Deixar em branco faria parecer que o campo não existe. "não informada" é
    // um fato sobre o registro, e a administradora pode cobrar.
    expect(corpoDoEmailDeMulta({ ...dados, ocorridoEm: null }))
      .toContain("DATA DA OCORRÊNCIA: não informada");
  });
});

describe("corpoDoEmail escolhe pelo tipo", () => {
  const dados = { destinatario: "Teresa", unidade: 1108, assunto: "a", descricao: "b", emitidaEm: "2026-04-01" };

  it("notificação manda a carta", () => {
    expect(corpoDoEmail(NOTIFICACAO, dados)).toContain("art. 1.348");
  });

  it("multa manda o pedido à administração", () => {
    const t = corpoDoEmail(MULTA, dados);
    expect(t).toContain("Valor da multa");
    expect(t).not.toContain("art. 1.348");
  });
});

describe("o link do Gmail", () => {
  const link = (tipo = NOTIFICACAO) =>
    linkDoGmail({ assunto: assuntoDoEmail(tipo, 1108), corpo: "corpo com acento é" });
  const parametros = (url) => new URL(url).searchParams;

  it("vai para os dois endereços", () => {
    const to = parametros(link()).get("to");
    for (const email of DESTINATARIOS_EMAIL) expect(to).toContain(email);
    expect(DESTINATARIOS_EMAIL).toHaveLength(2);
  });

  it("o título diz o tipo e a unidade", () => {
    expect(parametros(link()).get("su")).toBe("NOTIFICAÇÃO - BLOCO 1 - UNIDADE 108");
    expect(parametros(link(MULTA)).get("su")).toBe("MULTA - BLOCO 1 - UNIDADE 108");
  });

  it("escapa o corpo, senão quebra de linha e acento corrompem a URL", () => {
    const url = linkDoGmail({ assunto: "a", corpo: "linha 1\nlinha 2 & 3" });
    expect(url).not.toContain("\n");
    expect(parametros(url).get("body")).toBe("linha 1\nlinha 2 & 3");
  });

  it("abre o compositor, e não uma busca", () => {
    expect(parametros(link()).get("view")).toBe("cm");
  });
});

/**
 * A carta editável.
 *
 * O texto sai daqui para dentro de um editor que interpreta HTML, e volta de lá
 * para o corpo de um e-mail. As duas travessias têm armadilha: `descricao` é
 * texto que alguém digitou, e um `<` sem escapar já basta para o parágrafo
 * sumir da carta impressa sem erro nenhum.
 */
describe("carta em HTML", () => {
  it("escapa o que o usuário digitou", () => {
    const html = textoParaHtml("multa <b>alta</b> & cara");
    expect(html).toContain("&lt;b&gt;");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&amp;");
  });

  it("linha em branco vira parágrafo vazio, não some", () => {
    // É o espaçamento do modelo. Colapsar gruda a assinatura no último
    // parágrafo e a carta sai amontoada.
    const html = textoParaHtml("um\n\ndois");
    expect(html).toBe("<p>um</p><p><br></p><p>dois</p>");
  });

  it("a ida e a volta preservam o texto", () => {
    const original = "Prezado(a) Senhor(a),\n\nFica NOTIFICADO. 3 < 5 & pronto.";
    expect(htmlParaTexto(textoParaHtml(original))).toBe(original);
  });

  it("htmlParaTexto desfaz &amp; por último", () => {
    // Desfazer antes transformaria "&amp;lt;" em "<" — o texto passaria a
    // conter uma tag que nunca esteve lá.
    expect(htmlParaTexto("<p>&amp;lt;script&amp;gt;</p>")).toBe("&lt;script&gt;");
  });

  it("a carta salva manda; sem ela, monta na hora", () => {
    const dados = { destinatario: "Teresa", unidade: 1108, assunto: "a", descricao: "b", emitidaEm: "2026-04-01" };
    expect(htmlDaNotificacao({ texto: "<p>redação do síndico</p>" }, dados))
      .toBe("<p>redação do síndico</p>");
    expect(htmlDaNotificacao({ texto: "   " }, dados)).toContain("art. 1.348");
    expect(htmlDaNotificacao(null, dados)).toContain("art. 1.348");
  });
});

describe("sugestões de destinatário (cadastro + app)", () => {
  it("cadastro primeiro com o id; app depois, só o nome; sem repetir", async () => {
    const { sugestoesDeDestinatario } = await import("../lib/notificacoes");
    expect(sugestoesDeDestinatario(
      [{ id: 3, nome: "José  Souza" }, { id: 4, nome: "" }],
      ["jose souza", "Maria Lima", "  ", null, "Maria Lima"],
    )).toEqual([
      { id: 3, nome: "José  Souza", doApp: false },
      { id: "", nome: "Maria Lima", doApp: true },
    ]);
    expect(sugestoesDeDestinatario(undefined, undefined)).toEqual([]);
  });
});
