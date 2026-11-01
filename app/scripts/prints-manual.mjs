// Tira os prints do Manual no modo demo (ADR 0003): `npm run manual:prints`.
//
// Sobe o app em modo demo, entra com o login de exemplo de cada página, faz as
// ações que o passo declara no conteúdo (src/manual/paginas.js) e salva o PNG
// em public/manual/. Não roda no CI: rode na máquina e commite os PNGs.
//
// Precisa do Chromium do Playwright uma vez por máquina:
// `npx playwright install chromium`.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

// O cliente do Supabase lança na importação sem URL e chave. No modo demo
// nenhuma chamada vai para ele, então valores fictícios bastam; e por serem
// do processo, valem mais que um .env.local com o backend real.
process.env.VITE_SUPABASE_URL = "https://demo.supabase.invalid";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_demo";

const servidor = await createServer({
  root: RAIZ,
  mode: "demo",
  logLevel: "warn",
  server: { port: 5390, host: "127.0.0.1" },
});

let navegador;
try {
  const { exigeModoDemo, planoDosPrints, PASTA_DOS_PRINTS } =
    await servidor.ssrLoadModule("/src/manual/prints.js");
  exigeModoDemo(servidor.config.env);

  await servidor.listen();
  const base = new URL(servidor.resolvedUrls.local[0]);

  navegador = await chromium.launch();
  for (const item of planoDosPrints()) {
    const contexto = await navegador.newContext({ viewport: { width: 1280, height: 800 } });
    // Nada sai da máquina: só o próprio app responde.
    await contexto.route("**/*", (rota) =>
      new URL(rota.request().url()).host === base.host ? rota.continue() : rota.abort()
    );
    const pagina = await contexto.newPage();

    await pagina.goto(new URL("/login", base).href);
    await pagina.getByLabel("E-mail ou CPF").fill(item.email);
    await pagina.getByLabel("Senha", { exact: true }).fill(item.senha);
    await pagina.getByRole("button", { name: "Entrar" }).click();
    await pagina.waitForURL((url) => url.pathname !== "/login");

    await pagina.goto(new URL(item.rota, base).href);
    await pagina.waitForLoadState("networkidle");
    for (const acao of item.acoes) {
      if (acao.clicar) {
        await pagina.getByRole("button", { name: acao.clicar }).first().click();
      } else if (acao.rolarAte) {
        // Formulário comprido: rola até o texto para o print mostrar o fim.
        await pagina.getByText(acao.rolarAte, { exact: true }).first().scrollIntoViewIfNeeded();
      } else {
        throw new Error(`Ação desconhecida no print ${item.arquivo}: ${JSON.stringify(acao)}`);
      }
    }
    // Espera a animação de abertura dos diálogos terminar.
    await pagina.waitForTimeout(600);

    if (!(await pagina.title()).includes("Diduccio")) {
      throw new Error(`O print ${item.arquivo} não mostra a marca Diduccio.`);
    }

    const destino = join(RAIZ, "public", PASTA_DOS_PRINTS, item.arquivo);
    await mkdir(dirname(destino), { recursive: true });
    await pagina.screenshot({ path: destino });
    console.log(`print: public/${PASTA_DOS_PRINTS}/${item.arquivo}`);
    await contexto.close();
  }
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
} finally {
  await navegador?.close();
  await servidor.close();
}
