// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A tela de "Troque sua senha" que aparecia do nada.
 *
 * Relatado duas vezes: o app fica aberto um tempo e, sem ninguém pedir, a
 * exigência de trocar a senha volta — para quem tinha acabado de trocar.
 *
 * O token de acesso deste projeto dura 10 MINUTOS (medido: expires_in = 600).
 * Passado esse tempo com a tela parada, o `senha_ja_trocada` volta 401 "JWT
 * expired". E o `precisaTrocarSenha` lia esse 401 como resposta de negócio:
 *
 *     if (error) return true;   // "precisa trocar"
 *
 * O raciocínio por trás disso é bom e continua valendo — falha não pode virar
 * passe livre para uma senha que veio de um arquivo em texto puro. O erro foi
 * não separar as duas falhas: "o banco disse que você precisa trocar" e "seu
 * token venceu" chegam iguais na variável `error`, e só a primeira é uma
 * afirmação sobre a senha.
 *
 * É o MESMO defeito que derrubou a tela de Entregas e que o `comSessaoValida`
 * do db.js resolveu — 401 confundido com resposta. Só que o `precisaTrocarSenha`
 * ficou de fora: era a única chamada do sistema que não passava por ele.
 */

const RESPOSTA_401 = { data: null, error: { message: "JWT expired" }, status: 401 };
const JA_TROCOU = { data: true, error: null, status: 200 };
const NAO_TROCOU = { data: false, error: null, status: 200 };
const ERRO_DE_VERDADE = { data: null, error: { message: "function does not exist" }, status: 404 };

let respostasRpc = [];
let renovacoes = 0;
let renovacaoFalha = false;
let sessao = { session: { access_token: "abc" } };

vi.mock("../api/supabase", () => ({
  supabase: {
    rpc: async () => respostasRpc.shift() ?? JA_TROCOU,
    auth: {
      getSession: async () => ({ data: sessao }),
      refreshSession: async () => {
        renovacoes++;
        return { error: renovacaoFalha ? { message: "Invalid Refresh Token" } : null };
      },
      signOut: async () => ({}),
    },
    from: () => ({ then: (r) => Promise.resolve(JA_TROCOU).then(r) }),
  },
}));
vi.mock("../api/config", () => ({ MODO_DEMO: false, URL_DEMO: "https://demo.vit.local/exec" }));
vi.mock("../api/edge", () => ({ chamarEdgeFunction: async () => ({}) }));
vi.mock("../demo/servidor", () => ({ atender: async () => [] }));

const { precisaTrocarSenha } = await import("../api/auth");
const { SESSAO_EXPIRADA } = await import("../api/db");

beforeEach(() => {
  respostasRpc = [];
  renovacoes = 0;
  renovacaoFalha = false;
  sessao = { session: { access_token: "abc" } };
});

describe("o token vencido não pode virar exigência de trocar a senha", () => {
  it("token vencido: renova e pergunta de novo, em vez de exigir a troca", async () => {
    // O caso relatado, inteiro. Antes, esta chamada devolvia `true` e a tela
    // aparecia por cima do painel de quem só tinha deixado a aba aberta.
    respostasRpc = [RESPOSTA_401, JA_TROCOU];
    expect(await precisaTrocarSenha()).toBe(false);
    expect(renovacoes, "não tentou renovar o token").toBe(1);
  });

  it("e se a resposta depois da renovação for 'não trocou', aí sim exige", async () => {
    // A exigência continua funcionando: o que mudou é de onde vem a resposta.
    respostasRpc = [RESPOSTA_401, NAO_TROCOU];
    expect(await precisaTrocarSenha()).toBe(true);
  });

  it("sessão acabou de verdade: avisa que acabou, e NÃO pede senha nova", async () => {
    // Renovação falhou — o refresh token morreu (outra aba rodou o dele, ou
    // passou tempo demais). Isso é "entre de novo", não "sua senha está velha".
    respostasRpc = [RESPOSTA_401];
    renovacaoFalha = true;
    await expect(precisaTrocarSenha()).rejects.toThrow(SESSAO_EXPIRADA);
  });

  it("401 de novo mesmo depois de renovar também é sessão acabada", async () => {
    respostasRpc = [RESPOSTA_401, RESPOSTA_401];
    await expect(precisaTrocarSenha()).rejects.toThrow(SESSAO_EXPIRADA);
  });

  it("erro que NÃO é de token continua fechando a porta", async () => {
    // Aqui o raciocínio original vale inteiro: se a pergunta não pôde ser
    // respondida por um motivo que não é o token, o seguro é exigir a troca.
    // Uma senha de arquivo em texto puro não pode passar por causa de uma
    // função que sumiu do banco.
    respostasRpc = [ERRO_DE_VERDADE];
    expect(await precisaTrocarSenha()).toBe(true);
    expect(renovacoes, "renovou token para um erro que não era de token").toBe(0);
  });

  it("sem sessão nenhuma não exige nada: quem nem entrou não troca senha", async () => {
    sessao = { session: null };
    expect(await precisaTrocarSenha()).toBe(false);
  });

  it("caminho normal continua igual, e sem renovação à toa", async () => {
    respostasRpc = [JA_TROCOU];
    expect(await precisaTrocarSenha()).toBe(false);
    expect(renovacoes).toBe(0);

    respostasRpc = [NAO_TROCOU];
    expect(await precisaTrocarSenha()).toBe(true);
  });
});

describe("o App não confunde sessão vencida com senha por trocar", () => {
  const app = () => readFileSync("src/App.jsx", "utf8");

  it("o catch separa 'a sessão acabou' de 'falhou por outro motivo'", () => {
    // O `.catch(() => setTrocaPendente(true))` cru fazia qualquer tropeço de
    // rede virar a tela de troca obrigatória.
    //
    // A primeira versão deste teste só procurava a palavra SESSAO_EXPIRADA no
    // arquivo — e o import sozinho já a satisfazia. Apagar o desvio inteiro
    // passava batido. Agora o que se exige é o desvio em si, dentro do catch.
    const src = app();
    const i = src.indexOf(".catch((erro) => {");
    expect(i, "o catch da troca de senha sumiu ou mudou de forma").toBeGreaterThan(-1);
    const corpo = src.slice(i, src.indexOf("});", i));
    expect(corpo, "o catch voltou a tratar toda falha igual")
      .toMatch(/if \(erro\?\.message === SESSAO_EXPIRADA\) \{ handleLogout\(\); return; \}/);
    expect(corpo, "sessão vencida deixou de derrubar a sessão").toContain("handleLogout()");
  });

  it("o handleLogout é estável, senão o efeito pergunta ao banco sem parar", () => {
    // Ele entrou na lista de dependências do efeito. Sem `useCallback`, muda de
    // identidade a cada render, o efeito roda de novo, chama o banco, muda
    // estado, renderiza — e a tela entra num laço que só aparece em produção.
    const src = app();
    expect(src).toMatch(/const handleLogout = useCallback\(\(\) => \{/);
    expect(src, "o useCallback ganhou dependências e deixou de ser estável")
      .toMatch(/clearSessionToken\(\);\s*\n\s*\}, \[\]\);/);
    expect(src).toMatch(/\}, \[usuarioLogado, handleLogout\]\);/);
  });

  it("a exigência continua fechada para falha de verdade", () => {
    expect(app()).toMatch(/setTrocaPendente\(true\)/);
  });
});
