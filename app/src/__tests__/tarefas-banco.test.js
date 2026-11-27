// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

/**
 * A migração das tarefas, lida como texto.
 *
 * O que ela promete e que nenhum teste de tela alcança: quem lê, quem grava,
 * quem apaga, e que o carimbo de quem moveu e de quando concluiu é do banco —
 * não da tela, que poderia esquecer um dos três caminhos de mover.
 *
 * Normalizado para LF: no Windows o git converte a migração para CRLF assim
 * que a toca, e comparação que atravessa quebra de linha falharia por um "\r".
 */
const CAMINHO = "supabase/migrations/0042_tarefas.sql";
const sql = () => readFileSync(CAMINHO, "utf8").replace(/\r\n/g, "\n");

const politica = (nome) => {
  const texto = sql();
  const inicio = texto.indexOf(`create policy ${nome} `);
  if (inicio < 0) return "";
  return texto.slice(inicio, texto.indexOf(";", inicio) + 1);
};

describe("0042: a tabela", () => {
  it("existe", () => {
    expect(existsSync(CAMINHO)).toBe(true);
  });

  it("tem as quatro situações, fechadas por check", () => {
    expect(sql()).toMatch(
      /check \(situacao in \('A_FAZER', 'EM_ANDAMENTO', 'AGUARDANDO', 'CONCLUIDA'\)\)/
    );
  });

  it("responsável e unidade viram nulo quando a linha de origem some", () => {
    // Apagar um usuário não pode levar as tarefas dele junto.
    expect(sql()).toMatch(/responsavel_id\s+bigint references public\.usuarios\(id\) on delete set null/);
    expect(sql()).toMatch(/id_unidade\s+bigint references public\.unidades\(id\) on delete set null/);
  });

  it("o título não aceita vazio nem só espaços", () => {
    expect(sql()).toMatch(/titulo\s+text not null check \(btrim\(titulo\) <> ''\)/);
  });

  it("declara de quais migrações depende", () => {
    expect(sql()).toMatch(/DEPENDE DO 0015 .*0035/s);
  });

  it("liga o RLS", () => {
    expect(sql()).toContain("alter table public.tarefas enable row level security;");
  });
});

describe("0042: quem pode o quê", () => {
  it("a administração lê, cria e edita", () => {
    expect(politica("tarefas_ler")).toMatch(/for select to authenticated\s+using \(public\.eh_administrativo\(\)\)/);
    expect(politica("tarefas_criar")).toMatch(/for insert to authenticated\s+with check \(public\.eh_administrativo\(\)\)/);
  });

  it("a edição escreve as duas pontas", () => {
    // Numa política de UPDATE, `using` sozinho vale também como `with check`.
    // Dizer as duas é o que evita repetir o defeito do 0039.
    const editar = politica("tarefas_editar");
    expect(editar).toContain("for update to authenticated");
    expect(editar).toMatch(/using \(public\.eh_administrativo\(\)\)/);
    expect(editar).toMatch(/with check \(public\.eh_administrativo\(\)\)/);
  });

  it("só o síndico apaga", () => {
    expect(politica("tarefas_apagar")).toMatch(/for delete to authenticated\s+using \(public\.eh_sindico\(\)\)/);
  });

  it("o anônimo não tem nada", () => {
    expect(sql()).toContain("revoke all on public.tarefas from anon;");
  });
});

describe("0042: o carimbo é do banco", () => {
  it("a função roda como dona e com search_path fixo", () => {
    const s = sql();
    expect(s).toMatch(/create or replace function public\.tarefas_carimbar\(\)/);
    expect(s).toMatch(/security definer\s+set search_path = public/);
    expect(s).toContain("revoke execute on function public.tarefas_carimbar() from public;");
  });

  it("dispara na criação e na edição", () => {
    const s = sql();
    expect(s).toMatch(/before insert on public\.tarefas\s+for each row execute function public\.tarefas_carimbar\(\)/);
    expect(s).toMatch(/before update on public\.tarefas\s+for each row execute function public\.tarefas_carimbar\(\)/);
  });

  it("concluir grava a data, e sair de concluída a apaga", () => {
    expect(sql()).toMatch(/new\.concluida_em := case when new\.situacao = 'CONCLUIDA' then now\(\) else null end;/);
  });

  it("quem criou não pode ser reescrito numa edição", () => {
    expect(sql()).toContain("new.created_by := old.created_by;");
    expect(sql()).toContain("new.created_at := old.created_at;");
  });

  it("na criação, created_at e updated_at são do banco", () => {
    // O default só vale quando o cliente omite a coluna; sem o carimbo ele forjaria a data.
    expect(sql()).toContain("new.created_at := now();");
    expect(sql()).toContain("new.updated_at := now();");
  });

  it("só uma mudança de situação move; editar outra coisa preserva o carimbo", () => {
    const s = sql();
    expect(s).toContain("if new.situacao is distinct from old.situacao then");
    expect(s).toContain("new.movida_por := nullif(public.nome_atual(), '');");
    expect(s).toContain("new.movida_em := old.movida_em;");
    expect(s).toContain("new.movida_por := old.movida_por;");
    expect(s).toContain("new.concluida_em := old.concluida_em;");
  });

  it("a data de conclusão é calculada na criação e na mudança de situação", () => {
    const linha = /new\.concluida_em := case when new\.situacao = 'CONCLUIDA' then now\(\) else null end;/g;
    expect(sql().match(linha)).toHaveLength(2);
  });
});

/**
 * De onde vêm os nomes do campo Responsável.
 *
 * A primeira versão da tela lia `perfis_publicos`, a view que o 0016 derrubou
 * por entregar nome e cargo de funcionário a visitante anônimo. Em produção o
 * `listar` estourava e o quadro não abria para ninguém. O 0043 é a porta
 * estreita no lugar dela: só nomes da administração, só para a administração.
 */
describe("0043: quem aparece como responsável", () => {
  const CAMINHO_0043 = "supabase/migrations/0043_responsaveis_de_tarefa.sql";
  const sql43 = () => readFileSync(CAMINHO_0043, "utf8").replace(/\r\n/g, "\n");

  it("existe", () => {
    expect(existsSync(CAMINHO_0043)).toBe(true);
  });

  it("é uma função que roda como dona, com search_path fixo, e devolve três colunas", () => {
    const s = sql43();
    expect(s).toMatch(/create or replace function public\.responsaveis_de_tarefa\(\)/);
    expect(s).toMatch(/returns table \(id bigint, nome text, cargo text\)/);
    expect(s).toMatch(/security definer\s+set search_path = public/);
  });

  it("só a administração recebe linhas", () => {
    // Sem este filtro, security definer entregaria os nomes a qualquer
    // autenticado — o porteiro incluído.
    expect(sql43()).toMatch(/and public\.eh_administrativo\(\)/);
  });

  it("só nomes de síndico e auxiliar saem", () => {
    expect(sql43()).toMatch(/where u\.cargo in \('Sindico', 'Auxiliar Administrativo'\)/);
  });

  it("não devolve senha_hash, cpf nem e-mail", () => {
    expect(sql43()).toMatch(/select u\.id, u\.nome, u\.cargo\s+from public\.usuarios u/);
    expect(sql43()).not.toMatch(/select \*|senha_hash,|u\.cpf|u\.email/);
  });

  it("o anônimo não executa; o autenticado sim", () => {
    // Revogar só de `anon` não revoga nada: PUBLIC inclui `anon`.
    const s = sql43();
    expect(s).toContain("revoke execute on function public.responsaveis_de_tarefa() from public;");
    expect(s).toContain("revoke execute on function public.responsaveis_de_tarefa() from anon;");
    expect(s).toContain("grant execute on function public.responsaveis_de_tarefa() to authenticated;");
  });

  it("declara que depende do 0015", () => {
    expect(sql43()).toMatch(/DEPENDE DO 0015 \(eh_administrativo\)/);
  });

  it("não traz a perfis_publicos de volta", () => {
    expect(sql43()).not.toMatch(/create (or replace )?view public\.perfis_publicos/i);
    expect(sql43()).not.toMatch(/grant [^;]*perfis_publicos/i);
  });
});

/**
 * O bloco de notas das Tarefas: um por pessoa, e só a pessoa lê.
 *
 * Diferente do quadro, que é compartilhado, o bloco é rascunho pessoal —
 * nem o síndico lê o do auxiliar. A condição de dono tem de estar nas quatro
 * políticas: esquecer uma (a de UPDATE, por exemplo) deixaria um reescrever o
 * bloco do outro por upsert.
 */
describe("0044: o bloco de notas de cada um", () => {
  const CAMINHO_0044 = "supabase/migrations/0044_notas_das_tarefas.sql";
  const sql44 = () => readFileSync(CAMINHO_0044, "utf8").replace(/\r\n/g, "\n");
  const politica44 = (nome) => {
    const texto = sql44();
    const inicio = texto.indexOf(`create policy ${nome} `);
    if (inicio < 0) return "";
    return texto.slice(inicio, texto.indexOf(";", inicio) + 1);
  };
  // Comparado como texto, como o `nome_atual()` do 0035: um `usuario_id`
  // estragado no token não pode virar erro de cast.
  const DONO = "usuario_id::text = (auth.jwt() -> 'app_metadata' ->> 'usuario_id') and public.eh_administrativo()";
  const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  it("existe", () => {
    expect(existsSync(CAMINHO_0044)).toBe(true);
  });

  it("uma linha por usuário, que some junto com ele", () => {
    expect(sql44()).toMatch(
      /usuario_id bigint primary key references public\.usuarios\(id\) on delete cascade/
    );
  });

  it("o texto tem teto de 20000 caracteres e nunca é nulo", () => {
    expect(sql44()).toMatch(/texto\s+text not null default '' check \(length\(texto\) <= 20000\)/);
  });

  it("liga o RLS e toca o updated_at", () => {
    const s = sql44();
    expect(s).toContain("alter table public.notas_tarefas enable row level security;");
    expect(s).toMatch(/before update on public\.notas_tarefas\s+for each row execute function public\.tocar_updated_at\(\)/);
  });

  it("ler e apagar: só o dono, e só se for da administração", () => {
    expect(politica44("notas_tarefas_ler")).toMatch(
      new RegExp(`for select to authenticated\\s+using \\(${escapar(DONO)}\\);`)
    );
    expect(politica44("notas_tarefas_apagar")).toMatch(
      new RegExp(`for delete to authenticated\\s+using \\(${escapar(DONO)}\\);`)
    );
  });

  it("criar: o dono, pelo with check", () => {
    expect(politica44("notas_tarefas_criar")).toMatch(
      new RegExp(`for insert to authenticated\\s+with check \\(${escapar(DONO)}\\);`)
    );
  });

  it("editar escreve as duas pontas", () => {
    // Numa política de UPDATE, `using` sozinho vale também como `with check`
    // — a lição do 0039/0040. Aqui as duas por extenso.
    const editar = politica44("notas_tarefas_editar");
    expect(editar).toContain("for update to authenticated");
    expect(editar).toMatch(new RegExp(`using \\(${escapar(DONO)}\\)`));
    expect(editar).toMatch(new RegExp(`with check \\(${escapar(DONO)}\\)`));
  });

  it("não há política sem a condição de dono", () => {
    const politicas = sql44().match(/create policy [^;]+;/g) ?? [];
    expect(politicas).toHaveLength(4);
    for (const p of politicas) expect(p).toContain(DONO);
  });

  it("o anônimo não tem nada", () => {
    expect(sql44()).toContain("revoke all on public.notas_tarefas from anon;");
  });

  it("declara de quais migrações depende", () => {
    expect(sql44()).toMatch(/DEPENDE DO 0015 \(eh_administrativo\) e do 0035/);
  });
});

describe("0045: o auxiliar cuida só das tarefas dele", () => {
  // O síndico e o dev veem e mexem em todas; o auxiliar, só nas que têm ele
  // como responsável. "Dele" é o responsável, e não quem criou: o síndico
  // passa uma tarefa ao auxiliar e ela aparece para o auxiliar.
  const CAMINHO45 = "supabase/migrations/0045_auxiliar_ve_so_as_dele.sql";
  const sql45 = () => readFileSync(CAMINHO45, "utf8").replace(/\r\n/g, "\n");
  const politica45 = (nome) => {
    const texto = sql45();
    const inicio = texto.indexOf(`create policy ${nome} `);
    if (inicio < 0) return "";
    return texto.slice(inicio, texto.indexOf(";", inicio) + 1);
  };
  const REGRA =
    "public.eh_sindico() or (public.eh_auxiliar() and responsavel_id::text = (auth.jwt() -> 'app_metadata' ->> 'usuario_id'))";

  it("existe", () => {
    expect(existsSync(CAMINHO45)).toBe(true);
  });

  it("refaz as quatro políticas, todas com a mesma regra", () => {
    const s = sql45();
    for (const nome of ["tarefas_ler", "tarefas_criar", "tarefas_editar", "tarefas_apagar"]) {
      expect(s, `${nome} não é derrubada antes`).toContain(`drop policy if exists ${nome} on public.tarefas;`);
      expect(politica45(nome), `${nome} sem a regra`).toContain(REGRA);
    }
  });

  it("cada política é do comando certo", () => {
    expect(politica45("tarefas_ler")).toMatch(/for select to authenticated/);
    expect(politica45("tarefas_criar")).toMatch(/for insert to authenticated\s+with check \(/);
    expect(politica45("tarefas_apagar")).toMatch(/for delete to authenticated\s+using \(/);
  });

  it("a edição escreve as duas pontas, e o auxiliar não passa a tarefa para outro", () => {
    // Com `with check` igual ao `using`, a linha NOVA também tem de ser dele:
    // trocar o responsável para o síndico é recusado, em vez de a tarefa
    // sumir da tela de quem a mudou.
    const editar = politica45("tarefas_editar");
    expect(editar).toMatch(/for update to authenticated\s+using \(/);
    expect(editar).toMatch(/with check \(/);
    expect(editar.split(REGRA)).toHaveLength(3);
  });

  it("o auxiliar agora apaga as dele", () => {
    expect(politica45("tarefas_apagar")).toContain("public.eh_auxiliar()");
  });

  it("declara de quais migrações depende", () => {
    expect(sql45()).toMatch(/DEPENDE DO 0015 \(eh_sindico, eh_auxiliar\) e do 0042/);
  });
});
