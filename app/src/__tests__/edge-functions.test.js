// @vitest-environment node
//
// Node, e não jsdom: o `TextEncoder` do jsdom devolve um Uint8Array de outro
// realm, e o esbuild recusa rodar por causa disso. O resto da suíte precisa de
// jsdom para montar componentes; este arquivo não monta nada.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { transformSync } from "esbuild";

/**
 * As Edge Functions rodam em Deno, no servidor do Supabase, e NADA no projeto
 * olhava para elas: `npm run build` compila só o front-end, e a suíte só
 * importava módulos de `src/`. O erro de sintaxe aparecia no deploy — depois de
 * subir o arquivo, com a mensagem crua do bundler do Supabase.
 *
 * Foi o que aconteceu: uma quebra de linha entrou dentro de um `.join("...")`
 * ao gerar o arquivo, o `npm run build` passou, os 427 testes passaram, e o
 * defeito só apareceu no `functions deploy`.
 *
 * Isto não valida tipos nem lógica. Valida a única coisa que faltava: que o
 * arquivo é código, e não texto que parece código.
 */

const PASTA = "supabase/functions";

const funcoes = existsSync(PASTA)
  ? readdirSync(PASTA, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(PASTA, e.name, "index.ts")))
      .map((e) => e.name)
  : [];

/**
 * Todo o código de uma função: o `index.ts` e os módulos ao lado dele
 * (`fluxo.ts`, `regras.ts`...). As checagens textuais olhavam só o
 * `index.ts`, e a `cadastrar-morador` levou o CORS e as consultas para o
 * `fluxo.ts` — lá elas passariam sem ser vistas.
 */
const arquivosDa = (nome) =>
  readdirSync(join(PASTA, nome)).filter((a) => a.endsWith(".ts")).map((a) => join(PASTA, nome, a));
const fonteDa = (nome) => arquivosDa(nome).map((c) => readFileSync(c, "utf8")).join("\n");

const todosOsArquivos = [...funcoes, ...(existsSync(join(PASTA, "_shared")) ? ["_shared"] : [])]
  .flatMap(arquivosDa);

describe("Edge Functions", () => {
  it("existe pelo menos uma para verificar", () => {
    // Sem esta guarda, apagar a pasta faria a suíte passar sem testar nada.
    expect(funcoes.length).toBeGreaterThan(0);
  });

  it.each(todosOsArquivos)("%s faz parse", (caminho) => {
    const fonte = readFileSync(caminho, "utf8");
    // `transformSync` só analisa: não resolve `jsr:` nem `npm:`, que não
    // existem aqui e existem lá.
    expect(() => transformSync(fonte, { loader: "ts", sourcefile: caminho })).not.toThrow();
  });

  /**
   * O navegador PERGUNTA antes de mandar uma requisição com cabeçalhos fora do
   * básico. Se um cabeçalho que o cliente envia não estiver no
   * `Access-Control-Allow-Headers` da função, a requisição nem sai — e o erro
   * que chega ao JavaScript é "Failed to fetch", indistinguível de queda de
   * rede. Foi assim que o Comunicado dizia "sem conexão com o servidor" com o
   * servidor no ar, respondendo, e a autorização toda correta.
   *
   * O verificador com sessão real (`verificar-ia.mjs`) NÃO pega isto: ele roda
   * em node, e node não faz preflight. Só o navegador reprova — por isso o
   * cruzamento precisa ser feito aqui, lendo os dois lados.
   */
  // Lê a lista DECLARADA em `CABECALHOS_ENVIADOS`, e não o formato do `fetch`.
  // A primeira versão deste teste raspava os nomes do objeto de headers e
  // passou a falhar sozinha quando o `Authorization` virou spread condicional
  // (para o login, que não tem token). Teste que depende de como o código está
  // escrito quebra por motivo errado — e a pessoa aprende a ignorá-lo.
  const cabecalhosEnviados = (() => {
    const cliente = readFileSync("src/api/edge.js", "utf8");
    const lista = cliente.match(/CABECALHOS_ENVIADOS\s*=\s*\[([^\]]*)\]/)?.[1] ?? "";
    return [...lista.matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase());
  })();

  it("o cliente manda pelo menos authorization e apikey", () => {
    // Guarda contra o próprio teste virar inútil: se a extração falhar e voltar
    // vazia, o cruzamento abaixo passaria sem comparar nada.
    expect(cabecalhosEnviados).toEqual(expect.arrayContaining(["authorization", "apikey", "content-type"]));
  });

  it.each(funcoes)("%s permite todo cabeçalho que o cliente manda", (nome) => {
    const fonte = fonteDa(nome);
    const permitidos = (fonte.match(/"Access-Control-Allow-Headers":\s*"([^"]*)"/)?.[1] ?? "")
      .split(",").map((h) => h.trim().toLowerCase());

    for (const cabecalho of cabecalhosEnviados) {
      expect(permitidos, `${nome} não permite "${cabecalho}"`).toContain(cabecalho);
    }
  });

  /**
   * O que o supabase-js devolve em `.from(...)`, `.rpc(...)` e afins NÃO é uma
   * Promise: é um construtor de consulta que implementa `then` e mais nada.
   * `.catch()` nele é `undefined`, e chamá-lo lança TypeError.
   *
   * Numa Edge Function isso não vira um erro legível: a função inteira estoura,
   * o Deno responde 500 SEM os cabeçalhos de CORS, e o navegador reporta "No
   * 'Access-Control-Allow-Origin' header" — apontando para o lugar errado. Foi
   * assim que o login caiu em produção: `limpar_tentativas_login(...).catch()`
   * rodava em todo login CORRETO, depois de a senha já ter sido aceita.
   *
   * O parse não pega (é sintaxe válida) e nada mais no projeto executa estas
   * funções. Por isso a checagem é textual.
   */
  it.each(funcoes)("%s não usa .catch() em consulta do supabase-js", (nome) => {
    const fonte = fonteDa(nome);
    const suspeitas = [...fonte.matchAll(/\.(rpc|from|storage)\s*\([^\n]*\.catch\s*\(/g)];
    expect(
      suspeitas.map((m) => m[0]),
      `${nome}: erro do supabase-js vem no resultado ({ error }), não por exceção`
    ).toEqual([]);
  });

  it("a checagem de .catch() reprova o código que derrubou o login", () => {
    // Guarda do guarda: se a expressão parar de casar, o teste acima vira
    // decoração e passa para sempre. Aqui ela é medida contra a linha real.
    const quebrado = 'await admin.rpc("limpar_tentativas_login", { p_chave: chaveConta }).catch(() => {});';
    expect(quebrado).toMatch(/\.(rpc|from|storage)\s*\([^\n]*\.catch\s*\(/);
  });

  it.each(funcoes)("%s não traz chave de API escrita no arquivo", (nome) => {
    // A razão de existir destas funções é a chave NÃO estar no cliente. Uma
    // chave colada aqui por pressa seria commitada e publicada no GitHub —
    // pior que estar no bundle, que ao menos ninguém indexa.
    const fonte = fonteDa(nome);
    expect(fonte).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);       // Google
    expect(fonte).not.toMatch(/gsk_[0-9A-Za-z]{20,}/);          // Groq
    expect(fonte).not.toMatch(/sb_secret_[A-Za-z0-9_-]{8,}/);   // Supabase
    expect(fonte).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/); // JWT
  });

  /**
   * Quem roda sem JWT no gateway: as funções públicas, e só elas. Nas outras,
   * o gateway recusar quem não tem token é a primeira porta.
   */
});
