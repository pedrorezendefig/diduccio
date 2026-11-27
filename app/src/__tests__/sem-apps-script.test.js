// @vitest-environment node
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * O Apps Script saiu do sistema em 23/11/2026. O token dele ia no bundle
 * (`VITE_SHEETS_TOKEN`) e qualquer visitante o lia; com `ENFORCE_SESSION`
 * desligado, ele sozinho dava leitura e escrita na planilha antiga inteira.
 * Este teste impede que alguma tela volte a chamá-lo.
 */
function arquivos(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return nome === "__tests__" ? [] : arquivos(caminho);
    return /\.(jsx?|mjs)$/.test(nome) ? [caminho] : [];
  });
}

describe("o sistema não fala mais com o Apps Script", () => {
  const fontes = arquivos("src").map((f) => [f, readFileSync(f, "utf8")]);

  it.each(["VITE_SHEETS_TOKEN", "VITE_API_URL", "action=getFoto", "script.google.com"])("nenhum arquivo de src usa %s", (trecho) => {
    const achados = fontes.filter(([, texto]) => texto.includes(trecho)).map(([f]) => f);
    // config.js só cita as variáveis num comentário, explicando que saíram.
    expect(achados.filter((f) => !f.endsWith(join("api", "config.js")))).toEqual([]);
  });

  it("config.js não lê mais as variáveis do Apps Script", () => {
    const config = readFileSync("src/api/config.js", "utf8");
    expect(config).not.toMatch(/import\.meta\.env\.VITE_(SHEETS_TOKEN|API_URL)/);
  });

  // appscript/ é ignorado pelo git: só existe na máquina do Lucas.
  it.skipIf(!existsSync("appscript/Código.js"))("o Apps Script não tem token de reserva escrito no código", () => {
    const codigo = readFileSync("appscript/Código.js", "utf8");
    expect(codigo).toContain('throw new Error("TOKEN_SISTEMA não configurado nas Propriedades do script.");');
    expect(codigo).not.toMatch(/return "[A-Z0-9]{6,}";\n\}\)\(\);/);
  });
});
