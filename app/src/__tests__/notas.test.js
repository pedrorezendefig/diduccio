// @vitest-environment node
import { describe, it, expect } from "vitest";
import { juntarNotas, linhasDasNotas, tirarLinha, tirarLinhas } from "../lib/notas";

/**
 * O que fazer quando o banco é relido: `local` é o que a tela tem, `banco` o
 * que acabou de chegar, `lidoAntes` o que a tela sabia que o banco tinha.
 */
describe("juntarNotas", () => {
  it("o banco não mudou: fica o texto da tela, mesmo com alteração por gravar", () => {
    expect(juntarNotas("a\nb", "a", "a")).toEqual({ texto: "a\nb", conflito: false });
  });

  it("o banco mudou e a tela não tinha nada por gravar: vale o banco", () => {
    expect(juntarNotas("a", "a\nB", "a")).toEqual({ texto: "a\nB", conflito: false });
  });

  it("os dois mudaram: o banco, e no fim as linhas da tela que ele não tem", () => {
    expect(juntarNotas("a\nC", "a\nB", "a")).toEqual({ texto: "a\nB\nC", conflito: true });
  });

  it("no conflito, linha igual não se repete, e a comparação ignora espaços das pontas", () => {
    expect(juntarNotas("  B \nC\nD", "a\nB", "a")).toEqual({ texto: "a\nB\nC\nD", conflito: true });
  });

  it("no conflito, uma linha que a tela tem duas vezes e o banco uma entra mais uma vez", () => {
    expect(juntarNotas("x\nx", "x\ny", "")).toEqual({ texto: "x\ny\nx", conflito: true });
  });

  it("no conflito, banco terminado em quebra não ganha linha em branco", () => {
    expect(juntarNotas("C", "B\n", "a")).toEqual({ texto: "B\nC", conflito: true });
  });

  it("no conflito, banco vazio fica só com as linhas da tela", () => {
    expect(juntarNotas("C", "", "a")).toEqual({ texto: "C", conflito: true });
  });

  it("os dois chegaram ao mesmo texto: não é conflito", () => {
    expect(juntarNotas("a\nB", "a\nB", "a")).toEqual({ texto: "a\nB", conflito: false });
  });

  it("no conflito em que a tela só apagou linhas, fica o banco, e ainda é conflito", () => {
    // Apagar em um aparelho e escrever no outro: a linha apagada volta. Perder
    // uma anotação é pior que ver de novo uma que se quis apagar.
    expect(juntarNotas("a", "a\nb\nB", "a\nb")).toEqual({ texto: "a\nb\nB", conflito: true });
  });
});

describe("linhasDasNotas", () => {
  it("uma por linha, sem espaços nas pontas e sem as vazias", () => {
    expect(linhasDasNotas("  Trocar lâmpada  \n\n   \nLigar para a Enel\n")).toEqual([
      "Trocar lâmpada",
      "Ligar para a Enel",
    ]);
  });

  it("texto vazio, nulo ou só espaços não tem linha", () => {
    expect(linhasDasNotas("")).toEqual([]);
    expect(linhasDasNotas(null)).toEqual([]);
    expect(linhasDasNotas(undefined)).toEqual([]);
    expect(linhasDasNotas("  \n\t\n ")).toEqual([]);
  });

  it("CRLF é quebra de linha, e o \\r não fica colado no texto", () => {
    expect(linhasDasNotas("a\r\nb\r\n\r\nc")).toEqual(["a", "b", "c"]);
  });

  it("linhas repetidas continuam sendo duas", () => {
    expect(linhasDasNotas("a\na")).toEqual(["a", "a"]);
  });
});

describe("tirarLinha", () => {
  it("tira a linha do índice (contado entre as não vazias) quando ela é a esperada", () => {
    expect(tirarLinha("a\n\nb\nc", 1, "b")).toBe("a\n\nc");
  });

  it("com repetidas, tira a do índice e não a primeira", () => {
    expect(tirarLinha("a\nb\na", 2, "a")).toBe("a\nb");
  });

  it("compara sem os espaços das pontas", () => {
    expect(tirarLinha("a\n   b  \nc", 1, "b")).toBe("a\nc");
    expect(tirarLinha("a\nb\nc", 1, "  b ")).toBe("a\nc");
  });

  it("se o texto mudou e o índice aponta outra linha, tira a primeira igual", () => {
    // A pessoa inseriu uma linha no topo depois de escolher "b".
    expect(tirarLinha("novo\na\nb\nb", 1, "b")).toBe("novo\na\nb");
  });

  it("se não acha a linha, devolve o texto igual", () => {
    const texto = "a\r\n\r\nb";
    expect(tirarLinha(texto, 0, "z")).toBe(texto);
    expect(tirarLinha(texto, 5, "")).toBe(texto);
  });

  it("preserva o resto como estava, inclusive as linhas em branco do meio", () => {
    expect(tirarLinha("  a\n\n b \n\nc", 1, "b")).toBe("  a\n\n\nc");
  });

  it("CRLF: tira a linha e o resto sai com \\n, que é o que o textarea usa", () => {
    expect(tirarLinha("a\r\nb\r\nc", 1, "b")).toBe("a\nc");
  });

  it("não deixa linha em branco sobrando no começo nem no fim", () => {
    expect(tirarLinha("A\n\nB", 0, "A")).toBe("B");
    expect(tirarLinha("A\n\nB", 1, "B")).toBe("A");
    expect(tirarLinha("\n\nA\n\nB\n\n", 0, "A")).toBe("B");
  });

  it("as linhas em branco entre as que ficam continuam lá", () => {
    expect(tirarLinha("A\n\nB\n\nC", 0, "A")).toBe("B\n\nC");
    expect(tirarLinha("A\n\nB\n\nC", 1, "B")).toBe("A\n\n\nC");
  });

  it("tirar a última linha deixa o bloco vazio, sem sobra de espaços", () => {
    expect(tirarLinha("\n  só esta  \n\n", 0, "só esta")).toBe("");
  });

  it("texto vazio continua vazio", () => {
    expect(tirarLinha("", 0, "a")).toBe("");
    expect(tirarLinha(null, 0, "a")).toBe("");
  });
});

describe("tirarLinhas", () => {
  it("tira cada criada uma vez, a primeira ocorrência", () => {
    expect(tirarLinhas("a\nb\na\nc", ["a", "c"])).toBe("b\na");
  });

  it("repetida criada duas vezes sai duas vezes", () => {
    expect(tirarLinhas("a\nb\na", ["a", "a"])).toBe("b");
  });

  it("as que não foram criadas ficam", () => {
    expect(tirarLinhas("a\nb\nc", ["b"])).toBe("a\nc");
  });

  it("nenhuma criada devolve o texto igual", () => {
    expect(tirarLinhas("a\r\nb", [])).toBe("a\r\nb");
  });

  it("todas criadas deixa o bloco vazio", () => {
    expect(tirarLinhas(" a \n\n b", ["a", "b"])).toBe("");
  });
});
