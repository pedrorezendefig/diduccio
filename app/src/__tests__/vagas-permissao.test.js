// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { can, ROLES } from "../auth/permissions";
import { APLICADO, DISPONIVEL, SOLICITADO, escolhaTravada, podeMexerNaTag, statusQuePodeEscolher } from "../lib/tags";

/**
 * Quem faz o quê na tela de Vagas.
 *
 * O porteiro entrou aqui pelo 0037 e pelo 0038, e entrou até um ponto: ele VÊ a
 * vaga — de quem é, que placa mora nela —, PEDE uma TAG nova e CORRIGE a que
 * existe. Não cria vaga, não edita vaga, não escolhe o status da TAG, não apaga
 * nada.
 *
 * Os dois lados precisam de teste, e por motivos diferentes:
 *
 *   Se um botão aparecer a mais, ele não protege menos — o RLS continua
 *   recusando. O que acontece é pior de outro jeito: o porteiro clica, o
 *   Postgres nega, e a tela devolve "você não tem permissão" para uma pessoa
 *   que estava trabalhando. Botão que sempre falha é armadilha.
 *
 *   Se um botão sumir a menos, o síndico perde o trabalho dele sem aviso, e o
 *   defeito só aparece quando alguém precisa cadastrar uma vaga.
 */

const TELA = "src/pages/Vagas.jsx";
const fonte = () => readFileSync(TELA, "utf8");

const porteiro = { cargo: ROLES.PORTEIRO };
const sindico = { cargo: ROLES.SINDICO };
const auxiliar = { cargo: ROLES.AUX };
const dev = { cargo: ROLES.DEV };

describe("o alcance de cada cargo em Vagas", () => {
  it("o porteiro pede e corrige a TAG, e não toca na vaga", () => {
    expect(can(porteiro, "criarTag")).toBe(true);
    expect(can(porteiro, "editarTag")).toBe(true);
    expect(can(porteiro, "editarVaga")).toBe(false);
    expect(can(porteiro, "excluirVaga")).toBe(false);
  });

  it("o porteiro não escolhe o status da TAG", () => {
    // Ele PEDE: a TAG nasce "Solicitado" e fica esperando a administração.
    // Sem esta linha, criar TAG viraria liberar TAG.
    expect(can(porteiro, "definirStatusTag")).toBe(false);
    for (const quem of [sindico, auxiliar, dev]) {
      expect(can(quem, "definirStatusTag")).toBe(true);
    }
  });

  it("a administração continua com a tela inteira", () => {
    for (const quem of [sindico, auxiliar, dev]) {
      expect(can(quem, "editarVaga")).toBe(true);
      expect(can(quem, "criarTag")).toBe(true);
      expect(can(quem, "editarTag")).toBe(true);
      expect(can(quem, "definirStatusTag")).toBe(true);
    }
  });

  it("apagar é do síndico e do dev, como o banco manda", () => {
    // DELETE em `vagas` e `tags` é `eh_sindico()` desde o 0015, e `eh_sindico()`
    // não alcança o auxiliar. A lista aqui espelha o banco: se ela incluísse o
    // auxiliar, ele veria um botão que sempre devolve erro de RLS.
    expect(can(sindico, "excluirVaga")).toBe(true);
    expect(can(dev, "excluirVaga")).toBe(true);
    expect(can(auxiliar, "excluirVaga")).toBe(false);
  });

  it("o conselheiro não entra de jeito nenhum", () => {
    const conselheiro = { cargo: ROLES.CONSELHEIRO };
    for (const acao of ["editarVaga", "criarTag", "editarTag", "definirStatusTag", "excluirVaga"]) {
      expect(can(conselheiro, acao), acao).toBe(false);
    }
  });
});

describe("a tela obedece essas chaves", () => {
  it("nenhum botão de escrita ficou solto", () => {
    // O que este teste procura são as CHAMADAS soltas: uma ação de escrita que
    // não esteja dentro de uma guarda. Cada uma delas seria um botão visível
    // para o porteiro que o banco recusa.
    const src = fonte();
    for (const [acao, guarda] of [
      ["abrirNovaVaga", "podeEditarVaga"],
      ["abrirEdicaoVaga", "podeEditarVaga"],
      ["abrirNovaTag", "podeCriarTag"],
      ["abrirEdicaoTag", "podeEditarTag"],
      ["excluirVaga(v)", "podeExcluir"],
      ["excluirTag(t)", "podeExcluir"],
    ]) {
      // Toda aparição da ação em JSX (`onClick=`) tem de vir depois da guarda
      // dela, dentro do mesmo bloco.
      const usos = [...src.matchAll(new RegExp(`onClick=\\{[^}]*${acao.replace(/[()]/g, "\\$&")}`, "g"))];
      expect(usos.length, `${acao} sumiu da tela`).toBeGreaterThan(0);
      for (const uso of usos) {
        const antes = src.slice(Math.max(0, uso.index - 400), uso.index);
        expect(antes, `${acao} aparece sem a guarda ${guarda}`).toContain(guarda);
      }
    }
  });

  it("as guardas vêm do módulo de permissões, e não de um if de cargo", () => {
    // Comparar `user.cargo === "Porteiro"` dentro da tela espalha a regra: no
    // dia em que um cargo novo aparecer, ninguém lembra de vir aqui.
    const src = fonte();
    expect(src).toContain('import { can } from "../auth/permissions"');
    expect(src).toMatch(/const podeEditarVaga = can\(user, "editarVaga"\)/);
    expect(src).toMatch(/const podeCriarTag = can\(user, "criarTag"\)/);
    expect(src).toMatch(/const podeEditarTag = can\(user, "editarTag"\)/);
    expect(src).toMatch(/const podeExcluir = can\(user, "excluirVaga"\)/);
    expect(src, "voltou a comparar cargo na mão").not.toMatch(/cargo\s*===\s*["']/);
  });

  it("ver e exportar continuam abertos a quem já lê a lista", () => {
    // Exportar é a mesma lista que a pessoa já pode ler, levada para a planilha.
    // Trancar aqui não protegeria nada e tiraria trabalho do porteiro.
    const src = fonte();
    expect(src).toMatch(/onClick=\{\(\) => setModalExport\(true\)\}/);
    const exportar = src.slice(src.indexOf("setModalExport(true)") - 300, src.indexOf("setModalExport(true)"));
    expect(exportar, "exportar ficou preso a uma guarda").not.toMatch(/podeEditarVaga|podeCriarTag|podeExcluir/);
  });
});

describe("o menu deixa o porteiro chegar lá", () => {
  it("Vagas aparece para o porteiro na barra lateral", () => {
    // Sem isto, tudo acima é verdade e ninguém consegue abrir a tela.
    const sidebar = (readFileSync("src/components/Sidebar.jsx", "utf8") + readFileSync("src/auth/menu.js", "utf8"));
    const linha = sidebar.match(/ {2}Vagas: \[([^\]]*)\]/);
    expect(linha, "a chave Vagas sumiu do mapa do menu").toBeTruthy();
    expect(linha[1]).toContain("ROLES.PORTEIRO");
  });
});

describe("o status da TAG fica com a administração", () => {
  it("o <select> oferece só o que o cargo pode escolher agora", () => {
    // Deixar o campo aberto e a gravação falhar depois é o pior dos dois
    // mundos: o porteiro escolhe e perde o trabalho no botão de salvar.
    const src = fonte();
    expect(src).toMatch(/const podeDefinirStatus = can\(user, "definirStatusTag"\)/);
    expect(src).toContain("statusQuePodeEscolher(STATUS_TAG, {");
    const i = src.indexOf("value={formTag.status}");
    expect(i, "o campo de status sumiu do formulário").toBeGreaterThan(-1);
    const campo = src.slice(i, i + 300);
    expect(campo).toContain("disabled={escolhaTravada(statusAberto)}");
    expect(campo, "o <select> voltou a listar todos os status")
      .toContain("statusAberto.map(");
  });

  it("a tela explica o que a portaria pode fazer com o status", () => {
    const src = fonte();
    expect(src).toContain("Toda TAG pedida pela portaria entra como Solicitado");
    expect(src).toContain("A portaria marca a TAG como Aplicada depois de colar");
  });
});

describe("o 0038: pedir a TAG não é liberar a TAG", () => {
  const sql = readFileSync("supabase/migrations/0038_porteiro_pede_a_tag.sql", "utf8");

  it("o porteiro cria, e só nascendo Solicitado", () => {
    expect(sql).toContain("create policy tags_criar on public.tags");
    expect(sql).toContain("for insert to authenticated");
    expect(sql).toContain("public.eh_porteiro() and coalesce(status, '') = 'Solicitado'");
  });

  it("na edição o status só anda para Aplicado", () => {
    // Ele cola o adesivo e marca — isso é dele. Voltar uma TAG aplicada para
    // Solicitado, ou se dar "Disponivel", não é: Disponivel é a administração
    // dizendo que comprou o adesivo.
    expect(sql).toContain("before update on public.tags");
    expect(sql).toContain("porteiro_so_marca_a_tag_aplicada");
    expect(sql).toMatch(/if new\.status is distinct from old\.status/);
    expect(sql).toMatch(/coalesce\(new\.status, ''\) <> 'Aplicado'/);
    expect(sql).toMatch(/raise exception/);
  });

  it("deixar o status como está continua passando", () => {
    // É o caso de quem só veio corrigir o veículo. Sem o `is distinct from`
    // guardando a porta, salvar sem mexer no status daria erro.
    const i = sql.indexOf("is distinct from old.status");
    expect(i, "a comparacao com o valor antigo sumiu").toBeGreaterThan(-1);
    expect(sql.slice(i, i + 80)).toContain("and coalesce");
  });

  it("a comparação é `is distinct from`, e não `<>`", () => {
    // `status` é nulável. Com `<>`, trocar um status nulo por 'Aplicado' daria
    // NULL, o `if` não entraria, e a troca passaria em silêncio.
    const gatilho = sql.slice(sql.indexOf("returns trigger"));
    expect(gatilho, "voltou a comparar com <>").not.toMatch(/new\.status\s*<>\s*old\.status/);
  });

  it("a administração passa direto", () => {
    // Senão o síndico também ficaria preso ao status que a linha já tinha.
    const i = sql.indexOf("if public.eh_administrativo() then");
    expect(i, "o atalho da administração sumiu do gatilho").toBeGreaterThan(-1);
    expect(sql.slice(i, i + 90)).toContain("return new;");
  });

  it("o gatilho não fica chamável por ninguém de fora", () => {
    // O grant implícito do Postgres vai para PUBLIC, e PUBLIC inclui o anon.
    for (const quem of ["public", "anon"]) {
      expect(sql, `falta revogar de ${quem}`)
        .toContain(`revoke execute on function public.porteiro_so_marca_a_tag_aplicada() from ${quem};`);
    }
  });

  it("nada além de tags entrou no arquivo", () => {
    // Só as referências a TABELA: `on public.x` depois de policy/trigger. O
    // `revoke ... on function public.<nome>` cai fora, senão o nome da própria
    // função entraria na lista.
    const tabelas = new Set(
      [...sql.matchAll(/(?:on|update)\s+public\.(\w+)/g)]
        .map((m) => m[1])
        .filter((t) => !t.startsWith("porteiro_"))
    );
    expect([...tabelas]).toEqual(["tags"]);
  });
});

describe("os status que cada um pode escolher", () => {
  const TODOS = [
    { value: "Solicitado", label: "Solicitado" },
    { value: "Disponivel", label: "Disponível" },
    { value: "Aplicado", label: "Aplicado" },
  ];
  const valores = (r) => r.map((s) => s.value);

  it("a administração escolhe qualquer um, criando ou editando", () => {
    expect(statusQuePodeEscolher(TODOS, { livre: true, editando: false })).toEqual(TODOS);
    expect(statusQuePodeEscolher(TODOS, { livre: true, editando: true, atual: "Aplicado" })).toEqual(TODOS);
  });

  it("o porteiro criando só tem Solicitado", () => {
    // É o pedido inteiro: ele PEDE a TAG, não se dá uma.
    expect(valores(statusQuePodeEscolher(TODOS, { livre: false, editando: false })))
      .toEqual([SOLICITADO]);
  });

  it("o porteiro editando pode marcar Aplicado", () => {
    // Ele é quem está no portão com o adesivo na mão.
    expect(valores(statusQuePodeEscolher(TODOS, { livre: false, editando: true, atual: "Solicitado" })))
      .toEqual(["Solicitado", APLICADO]);
    expect(valores(statusQuePodeEscolher(TODOS, { livre: false, editando: true, atual: "Disponivel" })))
      .toEqual(["Disponivel", APLICADO]);
  });

  it("o porteiro NÃO se dá Disponivel nem volta atrás", () => {
    // "Disponivel" é a administração dizendo que comprou o adesivo. E uma TAG
    // já aplicada não volta para Solicitado pela portaria.
    const editandoSolicitado = valores(
      statusQuePodeEscolher(TODOS, { livre: false, editando: true, atual: "Solicitado" }));
    expect(editandoSolicitado).not.toContain("Disponivel");

    const jaAplicada = valores(
      statusQuePodeEscolher(TODOS, { livre: false, editando: true, atual: "Aplicado" }));
    expect(jaAplicada).toEqual([APLICADO]);
  });

  it("uma opção só trava o campo", () => {
    // Um <select> com uma escolha não é escolha; abrindo, ele finge que é.
    expect(escolhaTravada(statusQuePodeEscolher(TODOS, { livre: false, editando: false }))).toBe(true);
    expect(escolhaTravada(statusQuePodeEscolher(TODOS, { livre: false, editando: true, atual: "Solicitado" }))).toBe(false);
    expect(escolhaTravada(TODOS)).toBe(false);
  });

  it("a ordem do caminho da TAG é preservada", () => {
    // Solicitado → Disponivel → Aplicado. Embaralhar faria o <select> mudar de
    // ordem conforme o cargo de quem abriu.
    expect(valores(statusQuePodeEscolher(TODOS, { livre: false, editando: true, atual: "Disponivel" })))
      .toEqual(["Disponivel", "Aplicado"]);
  });

  it("lista ausente não quebra a tela", () => {
    expect(statusQuePodeEscolher(undefined, { livre: false })).toEqual([]);
    expect(escolhaTravada(undefined)).toBe(true);
  });
});

describe("a TAG só volta para a portaria quando está Disponível", () => {
  it("o porteiro alcança a Disponivel, e só ela", () => {
    // Antes disso o pedido está com a administração; depois de aplicada, acabou.
    expect(podeMexerNaTag({ livre: false, status: DISPONIVEL })).toBe(true);
    expect(podeMexerNaTag({ livre: false, status: SOLICITADO })).toBe(false);
    expect(podeMexerNaTag({ livre: false, status: APLICADO })).toBe(false);
  });

  it("status vazio ou estranho não abre a porta", () => {
    // Fail-closed: linha sem status é linha que ninguém sabe explicar.
    expect(podeMexerNaTag({ livre: false, status: null })).toBe(false);
    expect(podeMexerNaTag({ livre: false, status: "" })).toBe(false);
    expect(podeMexerNaTag({ livre: false, status: "Disponível" })).toBe(false);
    expect(podeMexerNaTag({ livre: false })).toBe(false);
    expect(podeMexerNaTag()).toBe(false);
  });

  it("a administração alcança qualquer uma", () => {
    for (const st of [SOLICITADO, DISPONIVEL, APLICADO, null, "seja o que for"]) {
      expect(podeMexerNaTag({ livre: true, status: st })).toBe(true);
    }
  });

  it("o botão de editar da linha respeita isso", () => {
    // Sem a condição, o botão aparece em toda linha e o 0039 recusa a gravação
    // depois de o porteiro já ter preenchido o formulário.
    const src = fonte();
    expect(src).toContain("podeMexerNaTag({ livre: podeDefinirStatus, status: t.status })");
  });
});

describe("o 0039: de onde o status pode partir", () => {
  const sql = readFileSync(
    "supabase/migrations/0039_porteiro_so_mexe_na_tag_disponivel.sql", "utf8");

  it("a política de UPDATE exige que a TAG esteja Disponivel", () => {
    // No `using`, e não no `with check`: o `using` é avaliado contra a linha
    // ANTIGA, que é a pergunta certa aqui — "em que estado ela está agora?".
    expect(sql).toContain("create policy tags_editar on public.tags");
    expect(sql).toContain("for update to authenticated");
    expect(sql).toContain("using (");
    expect(sql).toContain("public.eh_porteiro() and coalesce(status, '') = 'Disponivel'");
  });

  // O teste que existia aqui afirmava que o 0039 NÃO podia ter `with check`.
  // Estava errado, e foi ele que deixou o defeito passar: numa política de
  // UPDATE, `using` sozinho vale TAMBÉM como `with check`. O 0040 conserta, e
  // o teste do 0040 abaixo é quem guarda essa lição agora.

  it("a administração continua passando", () => {
    expect(sql).toContain("public.eh_administrativo()");
  });

  it("só mexe na tags_editar", () => {
    const politicas = [...sql.matchAll(/create policy (\w+)/g)].map((m) => m[1]);
    expect(politicas).toEqual(["tags_editar"]);
    expect(sql, "o 0039 mexeu no criar ou no apagar").not.toMatch(/tags_criar|tags_apagar|tags_ler/);
  });
});

describe("o 0040: a TAG precisa CONSEGUIR chegar em Aplicado", () => {
  const sql = readFileSync(
    "supabase/migrations/0040_a_tag_pode_chegar_em_aplicado.sql", "utf8");

  it("o `with check` é escrito, e não deixado por conta do `using`", () => {
    // A pegadinha que derrubou o 0039: numa política de UPDATE, `using`
    // sozinho vale também para a linha NOVA. Não existe "sem `with check`" —
    // existe "`with check` igual ao `using`". Sem esta linha explícita, marcar
    // 'Aplicado' faz a linha nova deixar de ser 'Disponivel' e a própria
    // política recusa.
    expect(sql).toMatch(/with check \(/);
    expect(sql).toContain("in ('Disponivel', 'Aplicado')");
  });

  it("as duas pontas dizem coisas diferentes", () => {
    // Se voltarem a dizer o mesmo, o defeito do 0039 volta inteiro.
    const usa = sql.slice(sql.indexOf("using ("), sql.indexOf("with check ("));
    const checa = sql.slice(sql.indexOf("with check ("));
    expect(usa, "o `using` deixou de exigir Disponivel").toContain("= 'Disponivel'");
    expect(checa, "o `with check` voltou a ser igual ao `using`")
      .not.toMatch(/coalesce\(status, ''\) = 'Disponivel'/);
  });

  it("Solicitado fica fora das duas pontas", () => {
    // Ele não parte de lá — o pedido está com a administração — nem volta para
    // lá: TAG aplicada não desaplica.
    const politica = sql.slice(sql.indexOf("create policy"));
    expect(politica).not.toContain("'Solicitado'");
  });

  it("a administração continua passando nas duas", () => {
    const politica = sql.slice(sql.indexOf("create policy"));
    expect([...politica.matchAll(/public\.eh_administrativo\(\)/g)].length).toBe(2);
  });

  it("só mexe na tags_editar", () => {
    const politicas = [...sql.matchAll(/create policy (\w+)/g)].map((m) => m[1]);
    expect(politicas).toEqual(["tags_editar"]);
  });
});
