// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { TIPOS_SOLICITANTE, descreverVeiculo, veiculoDaVaga } from "../lib/tags";

/**
 * A ficha da TAG: quem pediu, que veículo, quanto custou, quando entrega.
 *
 * A decisão que organiza tudo aqui é uma só: PLACA, MODELO E COR NÃO SÃO DA
 * TAG. São da vaga, e a TAG aponta para lá pelo `id_vagas`, que já existia.
 * Guardadas nos dois lugares, a cópia que ninguém atualiza vira a que a
 * portaria lê no portão — e ela lê para decidir se abre.
 *
 * A segunda é sobre dinheiro: custo total e data de entrega são da
 * administração, e isso está no BANCO (0041), não só na tela. O porteiro tem
 * token; esconder campo não esconde a API.
 */

const TELA = "src/pages/Vagas.jsx";
const fonte = () => readFileSync(TELA, "utf8");
// Normalizado uma vez, aqui: no Windows o git converte a migração para CRLF
// assim que a toca, e qualquer comparação que atravesse uma quebra de linha
// passa a falhar por um "\r" que não tem nada a ver com o que ela afirma. Já
// aconteceu duas vezes neste projeto.
const sql = () =>
  readFileSync("supabase/migrations/0041_a_tag_ganha_ficha.sql", "utf8").replace(/\r\n/g, "\n");

const VAGA = {
  possui_carro: "Sim", placa_carro: "ABC1D23", modelo_carro: "Gol", cor_carro: "Prata",
  possui_moto: "Sim", placa_moto: "XYZ9K88", modelo_moto: "Biz", cor_moto: "Vermelha",
};

describe("o veículo da TAG vem da vaga", () => {
  it("puxa placa, modelo e cor do veículo escolhido", () => {
    expect(veiculoDaVaga(VAGA, "Carro")).toEqual({ placa: "ABC1D23", modelo: "Gol", cor: "Prata" });
    expect(veiculoDaVaga(VAGA, "Moto")).toEqual({ placa: "XYZ9K88", modelo: "Biz", cor: "Vermelha" });
  });

  it("veículo não cadastrado devolve nada, e isso é a resposta", () => {
    // Foi o pedido: o veículo tem de estar cadastrado na tela anterior. Pedir
    // TAG de carro para quem só tem moto produziria um adesivo para uma placa
    // que ninguém sabe qual é.
    const soMoto = { ...VAGA, possui_carro: "Não" };
    expect(veiculoDaVaga(soMoto, "Carro")).toBeNull();
    expect(veiculoDaVaga(soMoto, "Moto")).not.toBeNull();
  });

  it("unidade sem vaga nenhuma também devolve nada", () => {
    expect(veiculoDaVaga(null, "Carro")).toBeNull();
    expect(veiculoDaVaga(undefined, "Moto")).toBeNull();
  });

  it("campo vazio na vaga não vira 'null' escrito na tela", () => {
    const semCor = { possui_carro: "Sim", placa_carro: "ABC1D23", modelo_carro: null, cor_carro: null };
    expect(veiculoDaVaga(semCor, "Carro")).toEqual({ placa: "ABC1D23", modelo: "", cor: "" });
  });

  it("a descrição não deixa separador sobrando", () => {
    expect(descreverVeiculo({ modelo: "Gol", cor: "Prata", placa: "ABC1D23" }))
      .toBe("Gol Prata · ABC1D23");
    expect(descreverVeiculo({ modelo: "", cor: "", placa: "ABC1D23" })).toBe("ABC1D23");
    expect(descreverVeiculo({ modelo: "Gol", cor: "", placa: "" })).toBe("Gol");
    expect(descreverVeiculo(null)).toBe("");
  });

  it("os dois tipos de solicitante, sem acento no valor gravado", () => {
    // O check do 0041 compara o VALOR. Acento ali quebraria a gravação de um
    // jeito que só apareceria no primeiro cadastro real.
    expect(TIPOS_SOLICITANTE.map((t) => t.value)).toEqual(["Proprietario", "Inquilino"]);
    expect(TIPOS_SOLICITANTE.map((t) => t.label)).toEqual(["Proprietário", "Inquilino"]);
  });
});

describe("a ficha no formulário", () => {
  it("pede solicitante, tipo e observações", () => {
    const src = fonte();
    expect(src).toContain('label="Nome do solicitante" required');
    expect(src).toContain('label="Tipo de solicitante" required');
    expect(src).toMatch(/observacoes: e\.target\.value/);
  });

  it("bloqueia TAG para veículo que a unidade não tem", () => {
    const src = fonte();
    expect(src).toMatch(/if \(vagaRelacionada && !veiculoDaTag\)/);
    expect(src).toContain("Registre na vaga primeiro.");
  });

  it("a TAG não guarda cópia de placa, modelo ou cor", () => {
    // Ancorado dentro do `salvarTag`: o `const dados` do formulário da VAGA
    // vem antes no arquivo, e ali placa e modelo são o assunto. Procurar o
    // primeiro `const dados` fazia este teste medir o bloco errado.
    const src = fonte();
    const salvar = src.indexOf("const salvarTag = async () => {");
    expect(salvar, "o salvarTag sumiu").toBeGreaterThan(-1);
    const i = src.indexOf("const dados = {", salvar);
    const dados = src.slice(i, src.indexOf("};", i));
    expect(dados, "o bloco medido não é o da TAG").toContain("id_vagas");
    expect(dados, "a TAG passou a guardar cópia do veículo").not.toMatch(/placa|modelo|cor_/);
    expect(src).toContain("veiculoDaVaga(");
  });

  it("custo e data de entrega não aparecem para a portaria", () => {
    // Aparecer travado seria pior: ele não tem nada a fazer com eles nem depois.
    const src = fonte();
    const i = src.indexOf('label="Custo total"');
    expect(i, "o campo de custo sumiu do formulário").toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, i - 800), i)).toContain("{podeDefinirStatus && (");
  });

  it("a portaria não manda custo nem data na gravação", () => {
    // Mandar null a partir dela APAGARIA o que a administração preencheu — e o
    // 0041 recusaria a gravação inteira, derrubando junto a correção legítima
    // que o porteiro estava fazendo.
    const src = fonte();
    const i = src.indexOf("if (podeDefinirStatus) {");
    expect(i, "o envio de custo/data deixou de ser condicional").toBeGreaterThan(-1);
    expect(src.slice(i, i + 400)).toContain("dados.custo_total");
  });

  it("custo zero não é tratado como vazio", () => {
    // `|| ""` transformaria a TAG de cortesia em "sem custo informado".
    expect(fonte()).toMatch(/custo_total: t\.custo_total \?\? ""/);
  });

  it("a cor entrou no cadastro da vaga, que é onde ela mora", () => {
    const src = fonte();
    for (const campo of ["cor_carro", "cor_moto"]) {
      expect(src, `${campo} não chegou ao formulário`)
        .toContain(`setForm({ ...form, ${campo}: e.target.value })`);
      expect(src, `${campo} não é gravado`).toContain(`${campo}: form.${campo} || null`);
    }
  });

  it("a lista de TAGs mostra o que passou a ser preenchido", () => {
    // Preencher sem exibir não serve: quem cobra a TAG precisa ver custo e
    // entrega sem abrir uma a uma.
    const src = fonte();
    for (const chave of ["nome_solicitante", "custo_total", "data_entrega"]) {
      expect(src, `${chave} não virou coluna`).toContain(`ordem: "${chave}"`);
    }
  });
});

describe("o 0041, no banco", () => {
  it("a cor vai para vagas, e não para tags", () => {
    const texto = sql();
    const emVagas = texto.slice(texto.indexOf("alter table public.vagas"), texto.indexOf("alter table public.tags"));
    expect(emVagas).toContain("cor_carro");
    expect(emVagas).toContain("cor_moto");

    const emTags = texto.slice(texto.indexOf("alter table public.tags"));
    expect(emTags, "a cor virou cópia dentro da TAG").not.toMatch(/add column if not exists cor_/);
    expect(emTags, "a placa virou cópia dentro da TAG").not.toMatch(/add column if not exists placa/);
  });

  it("as cinco colunas da ficha entram em tags", () => {
    for (const c of ["nome_solicitante", "tipo_solicitante", "custo_total", "data_entrega", "observacoes"]) {
      expect(sql(), `${c} não foi criada`).toContain(`add column if not exists ${c}`);
    }
  });

  it("dinheiro é numeric, nunca float", () => {
    // Ponto flutuante soma errado, e o erro aparece no fechamento do mês.
    expect(sql()).toMatch(/custo_total\s+numeric\(10, 2\)/);
    expect(sql()).not.toMatch(/custo_total\s+(float|real|double)/i);
  });

  it("o porteiro cria sem custo e sem data de entrega", () => {
    const texto = sql();
    const criar = texto.slice(texto.indexOf("create policy tags_criar"), texto.indexOf("create or replace function"));
    expect(criar).toContain("custo_total is null");
    expect(criar).toContain("data_entrega is null");
    expect(criar, "a TAG deixou de nascer Solicitado").toContain("coalesce(status, '') = 'Solicitado'");
  });

  it("e não consegue mexer neles depois", () => {
    expect(sql()).toContain("new.custo_total is distinct from old.custo_total");
    expect(sql()).toContain("new.data_entrega is distinct from old.data_entrega");
  });

  it("o gatilho reescrito NÃO perdeu a regra do status", () => {
    // `create or replace` é substituição total, não acréscimo. Apagar a regra
    // do 0038 aqui não daria erro nenhum, e o porteiro voltaria a mover o
    // status para onde quisesse. Já derrubou produção neste projeto uma vez.
    const texto = sql();
    const corpo = texto.slice(texto.indexOf("create or replace function"), texto.indexOf("revoke execute"));
    expect(corpo, "a regra do status do 0038 sumiu na reescrita")
      .toContain("new.status is distinct from old.status");
    expect(corpo).toContain("<> 'Aplicado'");
    expect(corpo, "o atalho da administração sumiu").toContain("if public.eh_administrativo() then");
  });

  it("o check do tipo entra sem validar o que já existe", () => {
    // A tabela já tem linhas, e nenhuma tem tipo: validar agora derrubaria a
    // migração por causa de dado anterior à regra.
    const texto = sql();
    const i = texto.indexOf("tags_tipo_solicitante_valido\n  check");
    expect(i, "o check do tipo sumiu").toBeGreaterThan(-1);
    expect(texto.slice(i, i + 200)).toContain("not valid");
  });
});
