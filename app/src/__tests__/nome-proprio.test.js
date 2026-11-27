import { describe, it, expect } from "vitest";
import { nomeProprio } from "../lib/format";

describe("nomeProprio: o nome como se escreve", () => {
  it("primeira letra de cada nome em maiúscula", () => {
    expect(nomeProprio("lucas sampaio")).toBe("Lucas Sampaio");
    expect(nomeProprio("LUCAS SAMPAIO")).toBe("Lucas Sampaio");
    expect(nomeProprio("lUCAS sAMPAIO")).toBe("Lucas Sampaio");
  });

  it("de, da, do, das, dos e e ficam minúsculos no meio", () => {
    expect(nomeProprio("JOÃO DA SILVA")).toBe("João da Silva");
    expect(nomeProprio("maria dos santos e souza")).toBe("Maria dos Santos e Souza");
    expect(nomeProprio("ana de oliveira do carmo")).toBe("Ana de Oliveira do Carmo");
  });

  it("partícula no começo do nome sobe", () => {
    expect(nomeProprio("da costa")).toBe("Da Costa");
  });

  it("acentos, hífen e apóstrofo", () => {
    expect(nomeProprio("élida ÁVILA")).toBe("Élida Ávila");
    expect(nomeProprio("ana-maria d'ávila")).toBe("Ana-Maria D'Ávila");
  });

  it("algarismo romano fica em caixa alta", () => {
    expect(nomeProprio("pedro de alcântara ii")).toBe("Pedro de Alcântara II");
    // "Vi" e "Li" são nomes: não viram algarismo romano.
    expect(nomeProprio("ana vi souza")).toBe("Ana Vi Souza");
    expect(nomeProprio("pedro xavier vi")).toBe("Pedro Xavier Vi");
    // Quem digitou "McArthur" sabia o que fazia; "lUCAS" é tecla errada.
    expect(nomeProprio("carlos McArthur")).toBe("Carlos McArthur");
    expect(nomeProprio("lUCAS sAMPAIO")).toBe("Lucas Sampaio");
  });

  it("espaço sobrando some, e vazio continua vazio", () => {
    expect(nomeProprio("  lucas   sampaio  ")).toBe("Lucas Sampaio");
    expect(nomeProprio("")).toBe("");
    expect(nomeProprio(null)).toBe("");
  });
});
