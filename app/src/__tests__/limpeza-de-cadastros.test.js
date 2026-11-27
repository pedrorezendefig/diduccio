// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * O 0036: o cadastro parado sai, o histórico fica.
 *
 * A regra inteira é SQL, e quem a executa é um agendador às 4h da manhã, sem
 * ninguém olhando. Um erro aqui não quebra tela nenhuma — ele apaga linha, de
 * madrugada, e só aparece quando alguém procura um registro que não existe
 * mais. Não há como desfazer.
 *
 * Por isso o que está travado abaixo são as CONDIÇÕES DE SEGURANÇA, uma a uma.
 * Cada `and` daquele delete é um jeito diferente de a limpeza apagar quem não
 * devia, e todos eles são invisíveis quando somem: o SQL continua válido,
 * continua rodando, e só apaga mais do que devia.
 *
 * A prova de que a regra FUNCIONA está no scripts/verificar-limpeza.mjs, que
 * roda contra o banco de verdade. Aqui a pergunta é outra: as travas ainda
 * estão no lugar?
 */

const sql = readFileSync(
  "supabase/migrations/0036_cadastro_parado_sai_o_historico_fica.sql", "utf8");

describe("a limpeza de cadastros parados (0036)", () => {
  it("apaga de entregadores, e de mais nada", () => {
    // O ponto inteiro do pedido: "o histórico permanece, apenas o cadastro dela
    // que sai". Um `delete` a mais aqui apaga a prova de quem entrou.
    const deletes = [...sql.matchAll(/delete\s+from\s+public\.(\w+)/gi)].map((m) => m[1]);
    expect(deletes).toEqual(["entregadores"]);
    expect(sql).not.toMatch(/delete\s+from\s+public\.entregadores_chegadas/i);
  });

  it("não apaga quem está DENTRO agora", () => {
    // Entrada antiga sem saída registrada é gente ainda no condomínio, ou uma
    // saída que ninguém fechou. Nos dois casos apagar o cadastro é a pior hora.
    expect(sql).toMatch(/or\s+c\.horario_saida\s+is\s+null/i);
  });

  it("não apaga cadastro recém-criado", () => {
    // Ele nasce junto com a primeira chegada. Se essa chegada falhar no meio,
    // sobra um cadastro sem histórico — e sem esta linha ele seria apagado na
    // madrugada seguinte, antes de a pessoa sequer voltar.
    expect(sql).toMatch(/and\s+e\.created_at\s+<\s+corte/i);
  });

  it("não apaga cadastro sem CPF", () => {
    // Sem CPF não há como ligar o cadastro a chegada nenhuma. Apagar seria
    // deletar por não conseguir identificar.
    expect(sql).toMatch(/regexp_replace\(coalesce\(e\.cpf, ''\), '\\D', '', 'g'\)\s*<>\s*''/);
  });

  it("compara CPF por dígito, dos dois lados", () => {
    // Um CPF pontuado de um lado e limpo do outro nunca casaria, e a pessoa
    // seria apagada como se nunca tivesse entrado. Hoje o banco está limpo, e é
    // justamente por isso que ninguém veria a diferença até acontecer.
    const dentroDoNotExists = sql.slice(sql.indexOf("not exists"), sql.indexOf("returning 1"));
    expect(dentroDoNotExists).toMatch(/regexp_replace\(coalesce\(c\.cpf, ''\)/);
    expect(dentroDoNotExists).toMatch(/regexp_replace\(coalesce\(e\.cpf, ''\)/);
  });

  it("tem o freio para tabela de chegadas vazia", () => {
    // Um truncate ou um insert que passou a ser recusado leria "ninguém entrou"
    // e apagaria o cadastro inteiro numa noite só.
    expect(sql).toMatch(/if\s+not\s+vivo\s+then/i);
    expect(sql).toMatch(/horario_entrada\s+>\s+now\(\)\s*-\s*janela_viva/i);
    // E o freio devolve zero em vez de seguir para o delete.
    const freio = sql.slice(sql.indexOf("if not vivo then"), sql.indexOf("with apagados"));
    expect(freio).toMatch(/return\s+0;/);
  });

  it("ninguém do app pode disparar a limpeza", () => {
    // O grant implícito do Postgres vai para PUBLIC, e PUBLIC inclui o anon.
    // Revogar só do anon deixa a porta aberta — já erramos isso neste projeto.
    for (const quem of ["public", "anon", "authenticated"]) {
      expect(sql, `falta revogar de ${quem}`).toMatch(
        new RegExp(`revoke execute on function public\\.limpar_cadastros_parados\\(int, interval\\) from ${quem};`)
      );
    }
    expect(sql).not.toMatch(/grant\s+execute\s+on\s+function\s+public\.limpar_cadastros_parados/i);
  });

  it("é security definer com search_path preso", () => {
    // Sem o search_path fixo, um schema no caminho da sessão pode sequestrar o
    // nome de uma tabela dentro de uma função que roda como dono.
    const corpo = sql.slice(sql.indexOf("create or replace function"), sql.indexOf("revoke execute"));
    expect(corpo).toMatch(/security definer/);
    expect(corpo).toMatch(/set search_path = public/);
  });

  it("o padrão é 3 meses, que foi o pedido", () => {
    expect(sql).toMatch(/meses int default 3/);
  });

  it("a auditoria registra sem carregar CPF nem nome", () => {
    const inserts = [...sql.matchAll(/insert into public\.auditoria[\s\S]*?\);/gi)].join("\n");
    expect(inserts).toBeTruthy();
    expect(inserts).not.toMatch(/\be\.cpf\b|\be\.nome\b|\bc\.cpf\b|\bc\.nome\b/);
  });

  it("o agendamento não derruba a migração se o pg_cron faltar", () => {
    // Uma migração que falha inteira por causa do agendador deixaria o banco
    // sem nem a função — e a função é a parte que importa.
    const bloco = sql.slice(sql.indexOf("create extension"));
    expect(bloco).toMatch(/exception when others then/i);
    expect(bloco).toMatch(/raise warning/i);
  });
});
