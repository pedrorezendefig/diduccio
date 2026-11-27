// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  MINIMO, regrasDaSenha, senhaValida, problemaDaSenha, traduzirErroDeSenha,
} from "../lib/senha";

/**
 * A mensagem que travou o primeiro login de alguém.
 *
 * A tela dizia "a senha precisa ter pelo menos 8 caracteres" para QUALQUER
 * recusa do servidor que mencionasse "at least" e "char". A recusa real deste
 * projeto é outra:
 *
 *   Password should contain at least one character of each:
 *   abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.
 *
 * É sobre TIPOS de caractere. Quem digitava dez letras minúsculas lia que
 * faltava tamanho, aumentava para doze, e continuava preso — a mensagem mandava
 * fazer exatamente o que já estava feito.
 *
 * Medido contra o servidor de verdade: "abc12345" e "abcd1234" recusados,
 * "Senha123" aceito. O que faltava era a maiúscula, nunca o tamanho.
 */

// A mensagem exata que o servidor devolveu na sonda. Trocá-la por uma
// aproximação faria o teste medir a minha lembrança, não o comportamento.
const RECUSA_DO_SERVIDOR =
  "Password should contain at least one character of each: " +
  "abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.";

describe("traduzir a recusa do servidor", () => {
  it("a recusa por TIPO de caractere não vira mensagem de tamanho", () => {
    // O coração do defeito. Esta mensagem contém "at least" e "char", e era
    // por isso que caía no ramo errado.
    const traduzida = traduzirErroDeSenha(RECUSA_DO_SERVIDOR);
    expect(traduzida).toMatch(/mai[úu]scula/i);
    expect(traduzida).toMatch(/min[úu]scula/i);
    expect(traduzida).toMatch(/n[úu]mero/i);
    expect(traduzida, "voltou a falar de tamanho").not.toMatch(/caracteres/i);
  });

  it("a recusa por tamanho usa o número do SERVIDOR", () => {
    // Fixar 8 aqui mentiria de novo no dia em que a política apertar.
    expect(traduzirErroDeSenha("Password should be at least 12 characters"))
      .toBe("A senha precisa ter pelo menos 12 caracteres.");
  });

  it("reconhece as outras recusas conhecidas", () => {
    expect(traduzirErroDeSenha("New password should be different from the old password"))
      .toMatch(/diferente da atual/i);
    expect(traduzirErroDeSenha("This password has been pwned")).toMatch(/vazamentos/i);
    expect(traduzirErroDeSenha("Failed to fetch")).toMatch(/conectar/i);
  });

  it("o que não conhece, repassa sem inventar", () => {
    // Traduzir por adivinhação foi o que criou o defeito. Diante do
    // desconhecido, mostrar o original deixa a pessoa com alguma pista.
    expect(traduzirErroDeSenha("Something entirely new")).toBe("Something entirely new");
    expect(traduzirErroDeSenha("")).toMatch(/Não foi possível/);
  });
});

describe("a regra, do lado de cá", () => {
  it("aceita o que o servidor aceitou", () => {
    // Exatamente as senhas da sonda.
    for (const boa of ["Senha123", "Senha12345", "Senha1234567", "S3nh@Fort3!2026"]) {
      expect(senhaValida(boa), `${boa} deveria passar`).toBe(true);
      expect(problemaDaSenha(boa)).toBe("");
    }
  });

  it("recusa o que o servidor recusou, e diz o que falta", () => {
    for (const ruim of ["abc12345", "abcd1234"]) {
      expect(senhaValida(ruim), `${ruim} deveria falhar`).toBe(false);
      expect(problemaDaSenha(ruim)).toMatch(/mai[úu]scula/i);
      // E não pode falar de tamanho: as duas têm oito.
      expect(problemaDaSenha(ruim)).not.toMatch(/caracteres/i);
    }
  });

  it("com tamanho faltando, fala de tamanho", () => {
    expect(problemaDaSenha("Ab1")).toBe(`Use pelo menos ${MINIMO} caracteres.`);
  });

  it("faltando mais de uma coisa, lista todas", () => {
    // "Falta uma maiúscula" com o número também faltando levaria a pessoa a
    // corrigir uma coisa por vez, adivinhando a próxima.
    const p = problemaDaSenha("abcdefghij");
    expect(p).toMatch(/mai[úu]scula/i);
    expect(p).toMatch(/n[úu]mero/i);
    expect(p).toMatch(/^Faltam /);
  });

  it("campo vazio não acusa nada", () => {
    // Erro antes de a pessoa digitar é ruído, não ajuda.
    expect(problemaDaSenha("")).toBe("");
    expect(problemaDaSenha(null)).toBe("");
  });

  it("cada regra é medida separadamente", () => {
    expect(regrasDaSenha("Senha123")).toEqual({
      tamanho: true, minuscula: true, maiuscula: true, digito: true,
    });
    expect(regrasDaSenha("SENHA123")).toMatchObject({ minuscula: false, maiuscula: true });
    expect(regrasDaSenha("senha123")).toMatchObject({ minuscula: true, maiuscula: false });
    expect(regrasDaSenha("SenhaSenha")).toMatchObject({ digito: false });
  });
});

describe("as telas usam a mesma regra", () => {
  const ler = (f) => readFileSync(f, "utf8");

  it("a troca obrigatória não tem mais regra própria", () => {
    // Duas cópias da regra divergem, e a que diverge é a que trava alguém.
    const src = ler("src/components/TrocarSenhaObrigatoria.jsx");
    expect(src).toContain('from "../lib/senha"');
    expect(src, "voltou a ter mínimo próprio").not.toMatch(/const MINIMO_SENHA = /);
    expect(src, "voltou a ter tradução própria").not.toMatch(/function traduzirErro\b/);
  });

  it("o cadastro de usuário valida a regra inteira, não só o tamanho", () => {
    // Senha inicial que passa na tela e é recusada pelo servidor volta como
    // erro em inglês no meio do cadastro.
    const src = ler("src/pages/Usuarios.jsx");
    expect(src).toContain("problemaDaSenha");
    expect(src, "voltou a olhar só o comprimento").not.toMatch(/senha\.length < MINIMO/);
  });
});

describe("o olho de mostrar a senha", () => {
  const ler = (f) => readFileSync(f, "utf8");

  it("a tela de login tem o campo com olho", () => {
    // Digitar senha às escuras num celular, de pé na portaria, erra muito — e o
    // erro é invisível: a tela diz "usuário ou senha incorretos" sem distinguir
    // a senha errada da senha certa digitada torto.
    const src = ler("src/pages/SelecaoUsuario.jsx");
    expect(src).toContain("<CampoSenha");
    expect(src, "sobrou um campo de senha cru").not.toMatch(/type="password"/);
  });

  it("o botão do olho é `type=button`", () => {
    // Dentro de um <form>, <button> sem type é submit: clicar no olho tentaria
    // entrar com a senha pela metade.
    const src = ler("src/ui/CampoSenha.jsx");
    const botao = src.slice(src.indexOf("<button"), src.indexOf("</button>"));
    expect(botao).toContain('type="button"');
    expect(botao).toMatch(/aria-label=/);
    expect(botao).toMatch(/aria-pressed=\{visivel\}/);
  });

  it("o olho não cobre o texto digitado", () => {
    // Sem o recuo, a senha longa passa por baixo do ícone e some justamente
    // quando a pessoa liga o olho para conferir.
    const css = ler("src/styles/ui.css");
    const campo = css.match(/\.vit-senha__campo \{[^}]*\}/)?.[0] ?? "";
    expect(campo).toMatch(/padding-right:\s*\d+px/);
  });

  it("o campo é exportado pelo kit, e não copiado em cada tela", () => {
    expect(ler("src/ui/index.js")).toContain('export { default as CampoSenha }');
  });
});
