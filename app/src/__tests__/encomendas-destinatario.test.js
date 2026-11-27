// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Quem recebe a encomenda, e quem NÃO pode ser reescrito.
 *
 * São dois campos lado a lado com regras opostas, e é fácil alguém "arrumar" a
 * assimetria achando que é descuido. Ela é de propósito:
 *
 * - NOME é livre. A etiqueta chega no nome que a transportadora escreveu, que
 *   nem sempre é o do titular — vem para o cônjuge, para o filho, ou errado. O
 *   valor vai para a linha da encomenda, não para o cadastro do morador.
 * - TELEFONE é travado. Ele só nasce preenchido quando o número foi CONFIRMADO
 *   na aba Confirmação, e é dele que sai o WhatsApp com o código de retirada.
 */

const fonte = () => readFileSync("src/pages/Encomendas.jsx", "utf8");

/** O trecho do <input> logo abaixo do <label> pedido. */
function campo(src, rotulo) {
  // Desde o guia de marca (2026-11-04) o campo é <Field label="…"> com <Input>.
  const i = src.indexOf(`<Field label="${rotulo}"`);
  expect(i, `campo "${rotulo}" sumiu do formulário`).toBeGreaterThan(-1);
  const abre = src.indexOf("<Input", i);
  const fecha = src.indexOf("/>", abre);
  expect(abre, `"${rotulo}" ficou sem input`).toBeGreaterThan(-1);
  return src.slice(abre, fecha);
}

describe("o destinatário da encomenda", () => {
  it("o nome continua editável com o morador escolhido e confirmado", () => {
    const nome = campo(fonte(), "Nome");
    expect(nome, "o nome voltou a travar quando há morador").not.toMatch(/disabled/);
    expect(nome).toContain("nome: e.target.value");
  });

  it("o nome não fica com cara de campo travado", () => {
    // A opacidade e o fundo de cartão eram o aviso visual de "não dá para
    // escrever aqui". Sobrar um deles diz ao porteiro que o campo está bloqueado
    // quando ele não está mais.
    const nome = campo(fonte(), "Nome");
    expect(nome).not.toMatch(/opacity/);
    expect(nome).not.toMatch(/bgCard/);
  });

  it("o telefone SEGUE travado quando o morador veio do cadastro", () => {
    // É o número que recebe o código de retirada. Digitar por cima mandaria a
    // mensagem para outro aparelho.
    const tel = campo(fonte(), "Telefone");
    expect(tel, "o telefone foi destravado junto").toContain("disabled={!!formData.id_morador}");
  });

  it("o nome digitado vai para a encomenda, e não para o cadastro do morador", () => {
    // Se um dia isso virar um editar("MORADORES", ...), corrigir uma etiqueta
    // passaria a renomear o morador no sistema inteiro.
    const src = fonte();
    expect(src).toMatch(/nome: formData\.nome\.trim\(\)/);
    expect(src).not.toMatch(/editar\("MORADORES"/);
  });

  it("o nome continua obrigatório", () => {
    // Destravar não é o mesmo que deixar salvar sem destinatário.
    expect(fonte()).toMatch(/if \(!formData\.nome\.trim\(\)\) errors\.nome =/);
  });
});

describe("de onde vem o nome (2026-11-07)", () => {
  it("o nome vem só de quem tem cadastro no app, nunca da tabela de moradores", () => {
    const src = fonte();
    const i = src.indexOf("const handleUnitSelect");
    const corpo = src.slice(i, src.indexOf("\n  };", i));
    expect(corpo).toMatch(/nomesNoApp\(uId\)/);
    expect(corpo, "o nome voltou a vir do cadastro de moradores").not.toMatch(/novoNome = mFiltrados/);
  });
  it("com mais de uma pessoa no app, o Destinatário lista os nomes do app", () => {
    const src = fonte();
    const i = src.indexOf('<Field label="Destinatário"');
    expect(src.slice(i - 200, i + 600)).toMatch(/nomesDoAppNaUnidade/);
    expect(src).not.toMatch(/moradoresDaUnidade/);
  });
});
