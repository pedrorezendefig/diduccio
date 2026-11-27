// @vitest-environment node
import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";

/**
 * Nenhum identificador órfão em `src/`.
 *
 * Este teste nasceu de um defeito que passou por `npm run build` e por 551
 * testes, e explodiu no primeiro clique do usuário: uma limpeza tirou o estado
 * `fotoAba`, mas deixou um `setFotoAba('recebimento')` numa função. O bundler
 * não reclama de identificador que não existe — ele só empacota, e a página
 * quebra com ReferenceError quando aquela linha roda.
 *
 * É o risco de toda remoção grande: o compilador não é um verificador de
 * nomes, e teste de unidade só cobre o caminho que ele exercita. `no-undef`
 * cobre o arquivo inteiro, inclusive o trecho que nenhum teste toca — e a regra
 * já estava ligada no projeto. Faltava alguém rodá-la.
 */

describe("no-undef em src/", () => {
  // UM lint só, compartilhado. Rodar o ESLint duas vezes sobre `src/` inteiro
  // custava ~10s de CPU e fazia os testes de tela vizinhos estourarem o tempo
  // do `waitFor` por falta de processador — falha intermitente num arquivo que
  // não tem nada a ver com este.
  const lint = (async () => new ESLint().lintFiles(["src/**/*.{js,jsx}"]))();

  it("nenhum nome usado sem existir", async () => {
    const resultados = await lint;

    // Sem esta guarda, um padrão de arquivos que deixasse de casar produziria
    // zero problemas e um teste verde para sempre.
    expect(resultados.length, "o lint não encontrou arquivo nenhum").toBeGreaterThan(30);

    const orfaos = resultados.flatMap((r) =>
      r.messages
        .filter((m) => m.ruleId === "no-undef")
        // Só as duas últimas partes do caminho: no Windows o caminho completo
        // enche a mensagem de erro e esconde justamente o nome do arquivo.
        .map((m) => `${r.filePath.split(/[\\/]/).slice(-2).join("/")}:${m.line} ${m.message}`)
    );

    expect(
      orfaos,
      "identificador que não existe: o build passa e a tela quebra no clique"
    ).toEqual([]);
  }, 60000);
});
