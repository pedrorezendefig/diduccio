import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { CLARO, ESCURO, MARCA } from "../theme/tokens.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(aqui, "../styles/tokens.css"), "utf8");

/** Extrai os pares --nome: #hex de dentro de um seletor. */
function lerBloco(seletor) {
  const inicio = css.indexOf(seletor);
  if (inicio === -1) throw new Error(`seletor ${seletor} não encontrado`);
  const abre = css.indexOf("{", inicio);
  const fecha = css.indexOf("\n}", abre);
  const corpo = css.slice(abre + 1, fecha);
  const mapa = {};
  for (const linha of corpo.split("\n")) {
    const m = linha.match(/^\s*--([\w-]+)\s*:\s*(#[0-9A-Fa-f]{6})\s*;/);
    if (m) mapa[m[1]] = m[2].toUpperCase();
  }
  return mapa;
}

const root = lerBloco(":root");
const dark = lerBloco('[data-theme="dark"]');

describe("tokens.js espelha tokens.css", () => {
  it.each(Object.entries(CLARO))("claro --%s", (nome, valor) => {
    expect(root[nome]).toBe(valor.toUpperCase());
  });

  it.each(Object.entries(MARCA))("marca --%s", (nome, valor) => {
    expect(root[nome]).toBe(valor.toUpperCase());
  });

  it.each(Object.entries(ESCURO))("escuro --%s", (nome, valor) => {
    expect(dark[nome]).toBe(valor.toUpperCase());
  });
});
