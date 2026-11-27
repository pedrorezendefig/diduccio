// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { can, ROLES } from "../auth/permissions";

/**
 * O livro de papel da portaria acabou.
 *
 * Quem o substituiu foi a retirada assinada (0027): o comprovante é a
 * assinatura, e dela não se arranca a folha. O que sobrou na tela depois disso
 * era pior que inútil — um modal pedindo "em que linha você anotou", a coluna
 * `ident_interna` guardando a resposta, e uma baixa antiga inteira, com campo
 * "página do livro", que nenhum botão alcançava mais.
 *
 * Código morto não incomoda ninguém até o dia em que alguém religa o botão.
 */

const TELA = "src/pages/Encomendas.jsx";
const fonte = () => readFileSync(TELA, "utf8");

describe("nada de livro em Encomendas", () => {
  it("não menciona ident_interna", () => {
    // A coluna existia para guardar o nº da linha do livro. Sem livro, ela só
    // pode voltar como campo que o porteiro preenche sem saber para quê.
    expect(fonte()).not.toMatch(/ident_interna|IDENT_INTERNA/);
  });

  it("não chama a tabela que o 0027 apagou", () => {
    // `entregas_recebimento` guardava a foto do comprovante da baixa antiga.
    // Uma chamada a ela hoje falha em tempo de execução, não de compilação — foi
    // assim que o grid inteiro parou de carregar uma vez.
    //
    // Proíbe a CHAMADA, não a menção: o comentário que conta essa história vale
    // mais ficando onde está.
    const chamadas = [...fonte().matchAll(/(?:listar|criar|editar|remover)\(\s*["']ENTREGAS_RECEBIMENTO/g)];
    expect(chamadas.map((m) => m[0])).toEqual([]);
  });

  it("não sobrou o fluxo da baixa antiga", () => {
    for (const morto of [
      "handleConfirmDelivery",
      "showConfirmDeliveryModal",
      "deliveryIdentInterna",
      "handleBaixa",
    ]) {
      expect(fonte(), `${morto} devia ter saído junto com a baixa antiga`).not.toContain(morto);
    }
  });

  it("continua mostrando o número para o porteiro escrever na encomenda", () => {
    // O número escrito na caixa é o que casa pacote e cadastro. Desde que o
    // aviso é só pelo app (2026-11-04), quem pede isso é o passo "Pronto" do
    // recebimento, com a etiqueta grande.
    expect(fonte()).toMatch(/Escreva no pacote/);
  });
});

describe("quem edita e quem exclui encomenda", () => {
  const dev = { cargo: ROLES.DEV };
  const sindico = { cargo: ROLES.SINDICO };
  const auxiliar = { cargo: ROLES.AUX };
  const porteiro = { cargo: ROLES.PORTEIRO };

  it("o dev pode as duas coisas", () => {
    // Era a pergunta que originou isto: no banco o dev sempre pôde — `eh_dev()`
    // está dentro de `eh_sindico()`. O que faltava era o botão.
    expect(can(dev, "editarEncomenda")).toBe(true);
    expect(can(dev, "excluirEncomenda")).toBe(true);
  });

  it("o síndico também", () => {
    expect(can(sindico, "editarEncomenda")).toBe(true);
    expect(can(sindico, "excluirEncomenda")).toBe(true);
  });

  it("o porteiro não", () => {
    expect(can(porteiro, "editarEncomenda")).toBe(false);
    expect(can(porteiro, "excluirEncomenda")).toBe(false);
  });

  it("o auxiliar não, porque editar implica apagar nota fiscal", () => {
    // Reduzir a quantidade de volumes remove linhas de `entregas_nf`, e DELETE
    // ali é do síndico (0015). Um botão que funciona até a hora em que o
    // auxiliar tira um item é pior que botão nenhum.
    expect(can(auxiliar, "editarEncomenda")).toBe(false);
    expect(can(auxiliar, "excluirEncomenda")).toBe(false);
  });

  it("a tela esconde os botões por esses mesmos nomes", () => {
    // Esconder botão não protege nada sozinho: com o próprio token a pessoa
    // chama a API pelo DevTools. Quem nega é o RLS — isto só evita oferecer o
    // que vai falhar.
    expect(fonte()).toContain("can(user, 'editarEncomenda')");
    expect(fonte()).toContain("can(user, 'excluirEncomenda')");
  });
});
