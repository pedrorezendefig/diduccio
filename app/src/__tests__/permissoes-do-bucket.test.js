// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * A última definição de `pode_*_anexo` não pode ter perdido nenhuma pasta.
 *
 * Este teste nasce de um defeito que derrubou a portaria em produção.
 * `pode_ler_anexo` e `pode_escrever_anexo` foram reescritas com
 * `create or replace` em quatro migrações. Cada autor copiou o corpo da versão
 * que tinha em mãos e acrescentou o seu ramo. O 0031 copiou o texto do 0019 —
 * anterior ao 0027 — e com isso APAGOU o ramo `retiradas`, sem que uma linha
 * sequer daquele arquivo falasse de retirada.
 *
 * O porteiro parou de conseguir subir a assinatura da baixa, e a tela mostrou
 * "row level security". Nenhum teste acusou: o SQL estava sintaticamente
 * perfeito, o build passou, e a suíte inteira ficou verde.
 *
 * `create or replace` de função compartilhada não é acréscimo, é substituição
 * total. O que se perde é o trabalho de quem veio no meio — e some em silêncio.
 */

const DIR = "supabase/migrations";
const FUNCOES = ["pode_ler_anexo", "pode_escrever_anexo", "pode_apagar_anexo"];

const arquivos = () => readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

/** Toda definição de uma função, na ordem das migrações. */
function definicoes(funcao) {
  const achadas = [];
  for (const arquivo of arquivos()) {
    const sql = readFileSync(`${DIR}/${arquivo}`, "utf8");
    const re = new RegExp(
      `create or replace function public\\.${funcao}\\(nome text\\)[\\s\\S]*?\\$\\$;`,
      "g"
    );
    for (const m of sql.matchAll(re)) achadas.push({ arquivo, corpo: m[0] });
  }
  return achadas;
}

/** As pastas que aparecem como `when '<pasta>'` num corpo. */
const pastasDe = (corpo) => [...corpo.matchAll(/when\s+'([a-z-]+)'/g)].map((m) => m[1]);

describe("as pastas do bucket sobrevivem a cada reescrita", () => {
  it("o extrator acha as definições (senão o teste passa por engano)", () => {
    // Sem esta guarda, um regex que deixasse de casar produziria lista vazia,
    // nada seria comparado, e o teste ficaria verde para sempre.
    for (const f of FUNCOES) {
      expect(definicoes(f).length, `nenhuma definição de ${f}`).toBeGreaterThan(0);
    }
    expect(definicoes("pode_ler_anexo").length).toBeGreaterThan(1);
  });

  it.each(FUNCOES)("a última definição de %s não perdeu pasta nenhuma", (funcao) => {
    const versoes = definicoes(funcao);
    const ultima = versoes[versoes.length - 1];

    // Toda pasta que QUALQUER versão já conheceu.
    const jaVistas = new Set(versoes.flatMap((v) => pastasDe(v.corpo)));
    const agora = new Set(pastasDe(ultima.corpo));

    const perdidas = [...jaVistas].filter((p) => !agora.has(p));
    expect(
      perdidas,
      `${ultima.arquivo} redefiniu ${funcao} e deixou de fora: ${perdidas.join(", ")}. ` +
      `Quem escreveu partiu de uma versão anterior — o ramo some sem erro de SQL.`
    ).toEqual([]);
  });

  it("o porteiro alcança as duas pastas em que ele trabalha", () => {
    // `encomendas` é a etiqueta; `retiradas` é a assinatura da baixa. Sem
    // qualquer uma das duas, a portaria para — e foi o que aconteceu.
    const escrever = definicoes("pode_escrever_anexo").at(-1).corpo;
    for (const pasta of ["encomendas", "retiradas"]) {
      const ramo = escrever.match(new RegExp(`when\\s+'${pasta}'[^\\n]*`))?.[0] ?? "";
      expect(ramo, `sem ramo '${pasta}' em pode_escrever_anexo`).not.toBe("");
      expect(ramo, `'${pasta}' precisa liberar o porteiro`).toContain("eh_porteiro()");
    }
  });

  it("comprovante assinado só o síndico apaga", () => {
    // Quem operou não desfaz a prova do que operou. Vale para a assinatura da
    // retirada e para a carta assinada da notificação.
    const apagar = definicoes("pode_apagar_anexo").at(-1).corpo;
    for (const pasta of ["retiradas", "notificacoes"]) {
      const ramo = apagar.match(new RegExp(`when\\s+'${pasta}'[^\\n]*`))?.[0] ?? "";
      expect(ramo, `sem ramo '${pasta}' em pode_apagar_anexo`).not.toBe("");
      expect(ramo).toContain("eh_sindico()");
    }
  });

  it("fora das pastas de prova, apagar continua seguindo escrever", () => {
    // O 0018 existe porque, com apagar preso ao síndico, um auxiliar trocando a
    // foto de um cadastro não removia a antiga — e o bucket acumulava arquivo
    // abandonado, ainda alcançável por URL assinada.
    const apagar = definicoes("pode_apagar_anexo").at(-1).corpo;
    expect(apagar).toMatch(/else\s+public\.pode_escrever_anexo\(nome\)/);
  });

  it("a política de apagar aponta para a função de apagar", () => {
    // Ela já foi escrita como `case` embutido na política (0027). Com a regra
    // dentro da política, ela não pode ser lida nem testada de fora.
    const ultima = arquivos()
      .map((f) => ({ f, sql: readFileSync(`${DIR}/${f}`, "utf8") }))
      .filter(({ sql }) => sql.includes("create policy anexos_apagar"))
      .at(-1);
    expect(ultima?.sql).toContain("public.pode_apagar_anexo(name)");
  });

  it("nenhuma das três funções fica executável pelo anônimo", () => {
    const tudo = arquivos().map((f) => readFileSync(`${DIR}/${f}`, "utf8")).join("\n");
    for (const f of FUNCOES) {
      expect(tudo, `${f} nunca teve o EXECUTE revogado do anônimo`).toMatch(
        new RegExp(`revoke execute on function public\\.%I\\(text\\) from anon|revoke execute on function public\\.${f}\\(text\\) from (public|anon)`)
      );
    }
  });
});
