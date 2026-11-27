// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { saidaVisivel, rotuloVia } from "../lib/retirada";
import { can, ROLES } from "../auth/permissions";
import { maskCPF } from "../lib/format";

/**
 * O card "Dados de Saída" segue a FOTO, não a encomenda.
 *
 * Numa encomenda com dois itens, um entregue e outro na prateleira, os dois
 * erros possíveis são silenciosos: ou o card fica vazio quando houve saída, ou
 * mostra a saída do outro item. O segundo é pior — vazio é visivelmente
 * "faltando", e nome preenchido parece resposta.
 */

const RETIRADA = {
  id: 44,
  retirado_por_nome: "Lucas Sampaio",
  retirado_por_cpf: "11122233344",
  entregue_por: "Porteiro",
  created_at: "2026-08-19T19:15:11Z",
};

// Linha migrada da planilha: tem os campos preenchidos e nenhuma saída
// registrada em retirada_itens.
const MIGRADA = {
  id: 3,
  nome_morador: "Antiga Moradora",
  cpf_morador: "99988877766",
  entregue_por: "Porteiro Antigo",
  data_saida: "2025-01-10T12:00:00Z",
};

describe("saidaVisivel", () => {
  it("item na tela que JÁ saiu preenche com a saída dele", () => {
    const r = saidaVisivel({ notaNaTela: { id: 14 }, retiradaDaNota: RETIRADA, encomenda: MIGRADA });
    expect(r.nome).toBe("Lucas Sampaio");
    expect(r.entreguePor).toBe("Porteiro");
    expect(r.quando).toBe("2026-08-19T19:15:11Z");
  });

  it("item na tela que NÃO saiu fica vazio, mesmo com outro item já entregue", () => {
    // O defeito que originou este teste: trocar para a foto do item que
    // continua na prateleira mostrava quem levou o outro.
    const r = saidaVisivel({
      notaNaTela: { id: 15 },
      retiradaDaNota: null,
      ultimaSaida: RETIRADA,
      encomenda: MIGRADA,
    });
    expect(r.retirada).toBeNull();
    expect([r.nome, r.cpf, r.entreguePor, r.quando]).toEqual(["", "", "", ""]);
  });

  it("sem item na tela, vale a última saída da encomenda", () => {
    const r = saidaVisivel({ notaNaTela: null, ultimaSaida: RETIRADA, encomenda: MIGRADA });
    expect(r.nome).toBe("Lucas Sampaio");
    expect(r.porItem).toBe(false);
  });

  it("sem saída registrada, cai na coluna da encomenda", () => {
    // É o caso das linhas migradas da planilha, que nunca passaram pelo
    // registro de retirada.
    const r = saidaVisivel({ notaNaTela: null, ultimaSaida: null, encomenda: MIGRADA });
    expect(r.nome).toBe("Antiga Moradora");
    expect(r.entreguePor).toBe("Porteiro Antigo");
    expect(r.quando).toBe("2025-01-10T12:00:00Z");
  });

  it("a coluna da encomenda NUNCA entra quando há item na tela", () => {
    // Seria o defeito de volta, por outro caminho.
    const r = saidaVisivel({ notaNaTela: { id: 15 }, retiradaDaNota: null, encomenda: MIGRADA });
    expect(r.nome).toBe("");
  });

  it("não estoura sem argumento nenhum", () => {
    expect(saidaVisivel().retirada).toBeNull();
  });
});

/**
 * A máscara de CPF.
 *
 * Formatar só no 11º dígito deixa quem digita vendo texto cru até o fim, e a
 * máscara aparecendo de uma vez. Formatar em cada tecla é o que se espera de um
 * campo com máscara — e o resultado final tem de continuar idêntico, senão o
 * que já está gravado passa a ser exibido de outro jeito.
 */
describe("maskCPF", () => {
  it("formata enquanto se digita", () => {
    expect(maskCPF("1")).toBe("1");
    expect(maskCPF("123")).toBe("123");
    expect(maskCPF("1234")).toBe("123.4");
    expect(maskCPF("1234567")).toBe("123.456.7");
    expect(maskCPF("1234567891")).toBe("123.456.789-1");
  });

  it("o CPF completo sai como sempre saiu", () => {
    expect(maskCPF("12345678910")).toBe("123.456.789-10");
    expect(maskCPF("123.456.789-10")).toBe("123.456.789-10");
  });

  it("ignora letra e não passa de 11 dígitos", () => {
    expect(maskCPF("abc12345678910999")).toBe("123.456.789-10");
  });

  it("aguenta vazio e nulo", () => {
    expect(maskCPF("")).toBe("");
    expect(maskCPF(null)).toBe("");
    expect(maskCPF(undefined)).toBe("");
  });
});

/**
 * "Cód. Entrega" não era dado de saída.
 *
 * O campo lia `entregas.cod` — o código que o gatilho do 0020 gera quando a
 * NOTIFICAÇÃO sai. Resultado: encomenda recém-cadastrada, notificação enviada,
 * status Pendente, o pacote inteiro parado na prateleira, e o card "Dados de
 * Saída" exibindo `Cód. Entrega: JYEXC`. Card que afirma saída onde não houve.
 *
 * No lugar entrou `via`, de `retiradas` — que só existe depois da assinatura e
 * responde o que interessa auditar: o morador provou com o código, ou o
 * porteiro liberou pela identificação?
 */
describe("como a retirada foi conferida", () => {
  const codigo = { ...RETIRADA, via: "codigo" };
  const identificacao = { ...RETIRADA, via: "identificacao" };

  it("traz a via da retirada que está na tela", () => {
    expect(saidaVisivel({ ultimaSaida: codigo }).via).toBe("codigo");
    expect(saidaVisivel({ ultimaSaida: identificacao }).via).toBe("identificacao");
  });

  it("encomenda que não saiu não tem via nenhuma", () => {
    // O caso relatado: notificada, pendente, nada assinado.
    const pendente = { id: 9, status: "Pendente", cod: "JYEXC", notificado: "SIM" };
    expect(saidaVisivel({ encomenda: pendente }).via).toBe("");
  });

  it("item na prateleira não herda a via de quem já levou o outro", () => {
    expect(
      saidaVisivel({ notaNaTela: { id: 2 }, retiradaDaNota: null, ultimaSaida: codigo }).via
    ).toBe("");
  });

  it("linha migrada não inventa conferência", () => {
    // A planilha não guardava isto. Preencher com "código" afirmaria uma
    // conferência que ninguém fez — o tipo de mentira que um registro assinado
    // não pode conter.
    expect(saidaVisivel({ encomenda: MIGRADA }).via).toBe("");
  });

  it("rotuloVia fala português e não estoura no vazio", () => {
    expect(rotuloVia("codigo")).toBe("Código");
    expect(rotuloVia("identificacao")).toBe("Identificação");
    expect(rotuloVia("")).toBe("");
    expect(rotuloVia(null)).toBe("");
    expect(rotuloVia(undefined)).toBe("");
    expect(rotuloVia("qualquer outra coisa")).toBe("");
  });
});

describe("quem enxerga o código de retirada", () => {
  const dev = { cargo: ROLES.DEV };
  const sindico = { cargo: ROLES.SINDICO };
  const auxiliar = { cargo: ROLES.AUX };
  const porteiro = { cargo: ROLES.PORTEIRO };

  it("o porteiro não", () => {
    // O código é a única coisa que a retirada exige que só o morador tem. Ler
    // na própria tela e digitar no diálogo esvazia a conferência inteira.
    expect(can(porteiro, "verCodigoRetirada")).toBe(false);
  });

  it("o auxiliar também não, porque ele também registra retirada", () => {
    expect(can(auxiliar, "verCodigoRetirada")).toBe(false);
  });

  it("síndico e dev sim: são a saída para quem perdeu o código", () => {
    expect(can(sindico, "verCodigoRetirada")).toBe(true);
    expect(can(dev, "verCodigoRetirada")).toBe(true);
  });

  it("nenhuma tela da portaria mostra o código: quem o informa é o morador", () => {
    // Decisão de 2026-11-04: nem para o síndico. O código só entra na conversa
    // quando o morador o diz na retirada.
    for (const arquivo of ["src/pages/Encomendas.jsx", "src/pages/Inicio.jsx", "src/lib/inicioCapa.js"]) {
      const fonte = readFileSync(arquivo, "utf8");
      expect(fonte, arquivo).not.toMatch(/Cód\. de retirada|código \{e\.cod\}|código \$\{e\.cod\}|\{recebido\.cod\}|getCell\(d, ['"]cod['"]\)/);
    }
  });
});
