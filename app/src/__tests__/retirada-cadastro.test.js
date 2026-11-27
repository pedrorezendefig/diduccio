// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { pendentesDoCadastro } from "../lib/retirada";

/**
 * A retirada dá baixa no cadastro aberto, e em mais nenhum.
 *
 * O defeito que estes testes prendem não quebra tela nenhuma: filtrando pela
 * UNIDADE, o diálogo abria com as outras encomendas do mesmo apartamento já
 * marcadas, e a assinatura do morador passava a cobrir pacote que ninguém tirou
 * da prateleira. O sistema seguia funcionando — só que o comprovante afirmava
 * uma entrega que não aconteceu.
 */

const UNIDADE = 5302;

// Duas encomendas do MESMO apartamento, cadastradas em dias diferentes. É este
// o caso que o filtro por unidade errava.
const ENCOMENDAS = [
  { id: 1, id_unidade: UNIDADE, nome: "Neide Carvalho", status: "Pendente" },
  { id: 2, id_unidade: UNIDADE, nome: "Neide Carvalho", status: "Pendente" },
  { id: 3, id_unidade: 5303, nome: "Outro Morador", status: "Pendente" },
  { id: 4, id_unidade: UNIDADE, nome: "Neide Carvalho", status: "Entregue" },
];

describe("pendentesDoCadastro", () => {
  it("traz só o cadastro aberto", () => {
    expect(pendentesDoCadastro(ENCOMENDAS, 1).map((e) => e.id)).toEqual([1]);
  });

  it("não traz outra encomenda da mesma unidade", () => {
    // O coração do pedido: a encomenda 2 é do mesmo apartamento e continua
    // pendente, e mesmo assim não pode receber baixa junto com a 1.
    const ids = pendentesDoCadastro(ENCOMENDAS, 1).map((e) => e.id);
    expect(ids).not.toContain(2);
  });

  it("não traz o cadastro que já saiu", () => {
    expect(pendentesDoCadastro(ENCOMENDAS, 4)).toEqual([]);
  });

  it("compara id como texto, porque a tabela devolve número e o formulário, string", () => {
    expect(pendentesDoCadastro(ENCOMENDAS, "1").map((e) => e.id)).toEqual([1]);
    expect(pendentesDoCadastro([{ ID: "1", STATUS: "Pendente" }], 1)).toHaveLength(1);
  });

  it("sem cadastro devolve lista vazia, e não a lista inteira", () => {
    // Sem esta guarda, a primeira renderização (antes de o porteiro escolher)
    // abriria com tudo marcado.
    expect(pendentesDoCadastro(ENCOMENDAS, null)).toEqual([]);
    expect(pendentesDoCadastro(ENCOMENDAS, undefined)).toEqual([]);
    expect(pendentesDoCadastro(ENCOMENDAS, "")).toEqual([]);
  });

  it("aguenta lista ausente sem estourar", () => {
    expect(pendentesDoCadastro(undefined, 1)).toEqual([]);
  });

  it("corta por status e não por data de saída", () => {
    // O histórico migrado tem linhas com status "Entregue" e data em branco.
    // Filtrar por `data_saida` faria todas elas voltarem como pendentes.
    const migrada = { id: 9, status: "ENTREGUE", data_saida: "" };
    expect(pendentesDoCadastro([migrada], 9)).toEqual([]);
  });
});

describe("a tela usa o filtro por cadastro", () => {
  it("Encomendas.jsx abre a retirada pelo cadastro e traz as outras da unidade", () => {
    // Desde 2026-11-04 uma assinatura cobre tudo o que o morador leva: o
    // cadastro aberto primeiro, as outras da unidade depois, cada item com a
    // sua caixa (ver pendentesDaRetirada).
    const fonte = readFileSync("src/pages/Encomendas.jsx", "utf8");
    expect(fonte).toContain("pendentesParaRetirar(encomendas, retiradaCadastro)");
  });
});
