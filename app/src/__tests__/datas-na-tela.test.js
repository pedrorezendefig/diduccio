// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dataBR } from "../lib/format";

/**
 * Data em formato inglês na tela é o defeito que não quebra nada.
 *
 * Veio da migração: no Apps Script `data_reserva` chegava "22/03/2026 14:00", e
 * `.split(' ')[0]` devolvia o formato brasileiro certinho. No Postgres a coluna
 * é `date` e chega "2026-09-06" — o mesmo corte passou a mostrar ISO. Nove
 * pontos de Churrasqueira e Festas ficaram assim, e nenhum teste acusou, porque
 * a tela continuava funcionando.
 *
 * Estes testes leem o CÓDIGO, não a renderização: o que se quer prender é a
 * volta do `.split(' ')[0]` em data mostrada a gente.
 */

const TELAS = ["src/pages/Churrasqueira.jsx", "src/pages/Festas.jsx"];
const TELA_DE_RESERVAS = "src/components/reservas/TelaDeReservas.jsx";

describe("datas mostradas ao usuário", () => {
  it.each(TELAS)("%s não corta data no espaço para exibir", (arquivo) => {
    // A rede é larga de propósito. A versão anterior deste teste procurava só
    // `.split(' ')[0]`, o corte literal — e deixou passar dois pontos escritos
    // `String(x).split(/[ T]/)[0]`, que é o MESMO defeito com outra roupa:
    // separador com espaço dentro, sobra ISO na tela. Foram parar justamente
    // na gaveta de detalhe, e a data apareceu "2026-08-15" para o síndico.
    //
    // O que separa o defeito do uso legítimo é o ESPAÇO no separador:
    // `.split("T")[0]` sobre um ISO devolve o próprio ISO e serve para lógica
    // e para gravar; separar no espaço só fazia sentido no Apps Script, onde a
    // data chegava "22/03/2026 14:00".
    const fonte = readFileSync(arquivo, "utf8");
    const cortes = [...fonte.matchAll(/data_reserva\)?\s*\??\.split\(([^)]*)\)\[0\]/g)]
      .filter((m) => m[1].includes(" "));
    expect(
      cortes.map((m) => m[0]),
      `${arquivo}: use dataBR(); cortar no espaço mostra "2026-09-06" na tela`
    ).toEqual([]);
  });

  it("o detalhe da reserva mostra a data pelo dataBR", () => {
    // Os dois pontos da gaveta, nomeados: o subtítulo e a linha "Data". São os
    // que o Lucas viu errados, e são os que ninguém revisa depois — a gaveta
    // abre por cima da lista, e a lista ao fundo já mostrava a data certa.
    // Desde 2026-11-04 o detalhe é desenhado em TelaDeReservas, para as duas.
    const fonte = readFileSync(TELA_DE_RESERVAS, "utf8");
    expect(fonte, "o subtítulo do detalhe voltou a mostrar ISO")
      .toContain("`Reserva para ${dataBR(v.data_reserva)}`");
    expect(fonte, 'a linha "Data" do detalhe voltou a mostrar ISO')
      .toContain('["Data", dataBR(v.data_reserva)');
  });

  it.each(TELAS)("%s importa dataBR", (arquivo) => {
    const fonte = readFileSync(arquivo, "utf8");
    expect(fonte).toMatch(/import \{[^}]*\bdataBR\b[^}]*\} from "\.\.\/lib\/format"/);
  });

  it.each(["src/pages/Assembleia.jsx", "src/components/AssembleiaChat.jsx"])(
    "%s não tem mais o soData da planilha", (arquivo) => {
    // A Assembleia teve o mesmo defeito com outra roupa: um `soData` local que
    // só tirava a hora do fim ("08/06/2026 00:00"), coisa que a planilha fazia
    // e o Postgres não faz. Sobre o ISO da coluna `date`, devolvia o ISO. A
    // renderização é medida em assembleia-datas.test.jsx; aqui só se prende a
    // volta do auxiliar.
    const fonte = readFileSync(arquivo, "utf8");
    expect(fonte, `${arquivo}: use dataBR() em vez de soData()`).not.toMatch(/\bsoData\b/);
    expect(fonte).toMatch(/import \{[^}]*\bdataBR\b[^}]*\} from "\.\.\/lib\/format"/);
  });

  it("o formulário mantém ISO no <input type=date>, que exige ISO", () => {
    // O contrário do teste acima, e igualmente importante: trocar por dataBR
    // aqui deixaria o campo de data em branco no navegador, porque o HTML só
    // aceita AAAA-MM-DD nesse controle.
    const fonte = readFileSync(TELA_DE_RESERVAS, "utf8");
    expect(fonte).toMatch(/d\.data_reserva\.split\('T'\)\[0\]/);
  });
});

describe("dataBR", () => {
  it("converte o que o Postgres devolve", () => {
    expect(dataBR("2026-09-06")).toBe("06/09/2026");
  });

  it("não perde um dia por causa do fuso", () => {
    // `new Date("2026-03-22")` é meia-noite UTC; formatado em Brasília (-03:00)
    // vira 21/03. Por isso `dataBR` recorta a string em vez de converter.
    expect(dataBR("2026-03-22")).toBe("22/03/2026");
    expect(dataBR("2026-01-01")).toBe("01/01/2026");
  });

  it("devolve vazio para nulo, em vez de 'Invalid Date'", () => {
    expect(dataBR(null)).toBe("");
    expect(dataBR("")).toBe("");
    expect(dataBR(undefined)).toBe("");
  });
});
