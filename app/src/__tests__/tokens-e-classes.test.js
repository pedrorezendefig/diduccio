// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";

/**
 * CSS que não existe não avisa.
 *
 * Dois defeitos irmãos, os dois encontrados na tela de trocar senha:
 *
 *  1. `className="vit-form"` no JSX, e NENHUMA regra `.vit-form` no CSS. Sem
 *     regra, os campos, a lista de regras da senha e o botão ficaram encostados
 *     uns nos outros. Era a queixa: "o botão está muito perto do quadrado".
 *
 *  2. `var(--fs-sm)` onde o token se chama `--text-sm`. Propriedade com valor
 *     inválido é DESCARTADA pelo navegador — o texto simplesmente herda o
 *     tamanho de outro lugar e ninguém vê erro em canto nenhum.
 *
 * Nenhum dos dois quebra o build, aparece no console ou derruba teste de
 * comportamento. Só ficam feios, e só em uma tela, que é onde ninguém olha
 * duas vezes.
 */

const ESTILOS = [
  ...readdirSync("src/styles").filter((f) => f.endsWith(".css")).map((f) => `src/styles/${f}`),
  "src/index.css",
].filter(existsSync);

const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "");
const cssTodo = () => ESTILOS.map((f) => semComentarios(readFileSync(f, "utf8"))).join("\n");

/** Todo `--nome:` que é DEFINIÇÃO — não o de dentro de um `var()`. */
function tokensDefinidos() {
  const semVar = cssTodo().replace(/var\([^)]*\)/g, "");
  return new Set([...semVar.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]));
}

describe("tokens do CSS", () => {
  it("o extrator acha os tokens (senão o teste passa por engano)", () => {
    const t = tokensDefinidos();
    expect(t.size).toBeGreaterThan(80);
    // Vários por linha no tokens.css: um extrator ancorado no início da linha
    // pegaria só o primeiro e daria falso alarme no resto.
    for (const esperado of ["--space-2", "--space-6", "--text-sm", "--leading-sm", "--fg-danger"]) {
      expect(t.has(esperado), `${esperado} deveria estar definido`).toBe(true);
    }
  });

  it("nenhum var() aponta para token que não existe", () => {
    const definidos = tokensDefinidos();
    const orfaos = [];
    for (const arquivo of ESTILOS) {
      const texto = semComentarios(readFileSync(arquivo, "utf8"));
      for (const m of texto.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g)) {
        // Só os SEM valor de reserva: `var(--x, 10px)` degrada sozinho.
        if (!definidos.has(m[1])) {
          orfaos.push(`${arquivo}:${texto.slice(0, m.index).split("\n").length} ${m[1]}`);
        }
      }
    }
    expect(
      orfaos,
      "token inexistente: a propriedade inteira é descartada, em silêncio"
    ).toEqual([]);
  });
});

describe("classes usadas no JSX existem no CSS", () => {
  // As telas do projeto usam muita classe vinda de biblioteca e muito estilo
  // em linha. Cobrir tudo daria falso alarme sem fim; o contrato aqui é o
  // prefixo do design system, que é nosso e mora todo em src/styles.
  const PREFIXO = /^vit-/;

  const arquivosDeTela = () => {
    const achados = [];
    const andar = (dir) => {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        if (item.name === "__tests__") continue;
        const caminho = `${dir}/${item.name}`;
        if (item.isDirectory()) andar(caminho);
        else if (/\.jsx?$/.test(item.name)) achados.push(caminho);
      }
    };
    andar("src");
    return achados;
  };

  it("encontra os arquivos de tela", () => {
    expect(arquivosDeTela().length).toBeGreaterThan(30);
  });

  it("toda classe vit-* usada tem regra escrita", () => {
    const css = cssTodo();
    const ausentes = new Set();

    for (const arquivo of arquivosDeTela()) {
      const fonte = readFileSync(arquivo, "utf8");
      // Só `className="literal"`. Classe montada por template não dá para
      // resolver lendo o arquivo, e chutar produziria alarme falso.
      for (const m of fonte.matchAll(/className="([^"{}]+)"/g)) {
        for (const classe of m[1].split(/\s+/).filter(Boolean)) {
          if (!PREFIXO.test(classe)) continue;
          // A classe precisa aparecer como SELETOR, e não dentro de outro nome:
          // `.vit-form` não pode ser dada por existente por causa de
          // `.vit-form__erro`.
          const seletor = new RegExp(`\\.${classe}(?![\\w-])`);
          if (!seletor.test(css)) ausentes.add(`${classe}  (${arquivo})`);
        }
      }
    }

    expect(
      [...ausentes],
      "classe sem regra: o elemento fica sem espaçamento nenhum, e nada avisa"
    ).toEqual([]);
  });
});

describe("o formulário da troca de senha respira", () => {
  const ui = () => readFileSync("src/styles/ui.css", "utf8");

  it("`.vit-form` separa os blocos", () => {
    const regra = ui().match(/\.vit-form \{[^}]*\}/)?.[0] ?? "";
    expect(regra, "sem regra, tudo fica encostado").not.toBe("");
    expect(regra).toMatch(/gap:\s*var\(--space-\d+\)/);
  });

  it("o botão de salvar não fica colado no último campo", () => {
    expect(ui()).toMatch(/\.vit-form > button\[type="submit"\] \{[^}]*margin-top/);
  });

  it("a lista de regras não puxa para cima", () => {
    // Ela tinha margem negativa para colar no campo. Colada é exatamente a
    // queixa: "as escritas de 8 caracteres estão muito próximas".
    const regra = ui().match(/\.vit-senha-regras \{[^}]*\}/)?.[0] ?? "";
    expect(regra).not.toMatch(/margin:\s*calc\([^)]*-1\)/);
    expect(regra).not.toMatch(/margin-top:\s*-/);
  });
});
