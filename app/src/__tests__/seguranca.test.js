import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../api/supabase";

describe("cliente supabase", () => {
  it("usa a publishable key, nunca uma secret", () => {
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    expect(key).toMatch(/^sb_publishable_/);
    // sb_secret_ no bundle seria acesso irrestrito ao banco para qualquer
    // visitante. Este teste existe para nunca acontecer por descuido.
    expect(key).not.toMatch(/^sb_secret_/);
  });

  it("expõe um cliente utilizável", () => {
    expect(supabase.from).toBeTypeOf("function");
    expect(supabase.auth).toBeDefined();
  });
});

// Só um projeto de verdade responde: sem `.env.local` (CI, clone novo) o
// endereço é o de mentira do vite.config.js e estes blocos se pulam.
const PROJETO_REAL = /^https:\/\/.+\.supabase\.co$/.test(import.meta.env.VITE_SUPABASE_URL ?? "");

describe.skipIf(!PROJETO_REAL)("configuração do projeto Supabase", () => {
  it("cadastro público está desligado", async () => {
    const r = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`,
      { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
    );
    const s = await r.json();
    // Com signup aberto, qualquer um de posse da publishable key (que é
    // pública) cria conta e vira usuário autenticado — e aí as políticas de
    // RLS por cargo não protegem nada, porque o invasor não precisa burlar
    // política nenhuma: ele é um usuário legítimo.
    expect(s.disable_signup).toBe(true);
  });
});

describe.skipIf(!PROJETO_REAL)("RLS visto de fora", () => {
  // Cliente próprio, sem sessão: é o que um visitante qualquer consegue fazer
  // de posse da publishable key, que vai pública no bundle.
  const anon = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } }
  );

  it("anônimo não lê moradores", async () => {
    const { data } = await anon.from("moradores").select("id").limit(5);
    // O RLS devolve lista vazia em vez de erro — por isso conferimos tamanho,
    // não a ausência de error.
    expect(data ?? []).toHaveLength(0);
  });

  it("anônimo não lê a tabela usuarios, que guarda senha_hash", async () => {
    const { data } = await anon.from("usuarios").select("*").limit(5);
    expect(data ?? []).toHaveLength(0);
  });

  it("anônimo não lê nome nem cargo de funcionário", async () => {
    // A view `perfis_publicos` existia para a grade de perfis do login, que
    // listava quem podia entrar ANTES de qualquer autenticação — daí o
    // `grant select to anon`. A grade morreu quando o login virou e-mail ou
    // CPF mais senha, e o que sobrou era nome e cargo de todos os
    // funcionários abertos a qualquer visitante. Derrubada no 0016.
    const { data, error } = await anon.from("perfis_publicos").select("*");
    expect(data ?? []).toHaveLength(0);
    expect(error, "a view voltou a existir — quem a recriou?").toBeTruthy();
  });

  it("anônimo não alcança mais o email_de_login", async () => {
    // Este teste mudou de sentido no 0023, e a mudança é o ponto.
    //
    // Antes, a função PRECISAVA responder ao anônimo: o navegador convertia CPF
    // em e-mail para então chamar `signInWithPassword`. O melhor que se podia
    // exigir era que ela não confirmasse quem existe. Só que, para quem
    // EXISTE, ela devolvia o e-mail — então qualquer um com a chave publicável
    // ligava um CPF a um e-mail.
    //
    // Agora o login inteiro acontece na Edge Function `entrar`, que resolve o
    // identificador com a service role. A função foi fechada para todo mundo, e
    // a exigência passou de "não confirme" para "não responda".
    const { error } = await anon.rpc("email_de_login", { identificador: "nao-existe@x.com" });
    expect(error).toBeTruthy();
  });
});

describe("bundle de produção", () => {
  const dir = "dist/assets";
  const temBuild = existsSync(dir);

  // skipIf e não `return`: teste que sai calado por falta de build passaria
  // verde e daria a impressão de que o bundle foi conferido.
  it.skipIf(!temBuild)("não contém chave secreta", () => {
    const js = readdirSync(dir).filter((f) => f.endsWith(".js"));
    expect(js.length).toBeGreaterThan(0);

    // Uma CHAVE, não o prefixo solto. O próprio supabase-js carrega a string
    // "sb_secret_" numa função que classifica o tipo da chave
    // (`r.startsWith("sb_publishable_") || r.startsWith("sb_secret_")`), e
    // procurar o prefixo puro acusava a biblioteca como se fosse vazamento.
    // Chave de verdade tem corpo depois do prefixo.
    const CHAVE_SECRETA = /sb_secret_[A-Za-z0-9_-]{8,}/;

    for (const arquivo of js) {
      const conteudo = readFileSync(join(dir, arquivo), "utf8");
      // Falha aqui significa que uma chave secreta ganhou prefixo VITE_ em
      // algum momento — o Vite empacota tudo que começa com VITE_, e a secret
      // key dá acesso irrestrito ao banco, ignorando o RLS.
      const achada = conteudo.match(CHAVE_SECRETA);
      // A mensagem mostra só o prefixo: imprimir o achado colocaria a chave
      // na saída do CI, que é justamente o que não pode acontecer.
      expect(achada?.[0]?.slice(0, 14) ?? null, `${arquivo} contém uma secret key`).toBeNull();

      expect(conteudo, `${arquivo} contém service_role`).not.toContain("service_role");
    }
  });

  it.skipIf(!temBuild)("não contém a secret key deste projeto", () => {
    // O teste acima procura o formato; este procura o valor exato, quando ele
    // está disponível no ambiente. É a checagem que não depende de a chave
    // continuar tendo o formato de hoje.
    const secreta = process.env.SUPABASE_SECRET_KEY;
    if (!secreta || secreta.length < 12) return;

    for (const arquivo of readdirSync(dir).filter((f) => f.endsWith(".js"))) {
      const conteudo = readFileSync(join(dir, arquivo), "utf8");
      expect(conteudo.includes(secreta), `${arquivo} contém a secret key do projeto`).toBe(false);
    }
  });
});

/**
 * O modelo de cargos do 0015, conferido no texto do SQL.
 *
 * Não substitui testar contra o banco com sessão real de cada cargo — nada
 * substitui isso, e quatro defeitos já passaram pelo SQL Editor sem erro. Mas
 * pega a classe de engano que o banco NÃO acusa: tabela sem política nega tudo
 * em silêncio, e a tela só mostra uma lista vazia. Uma aba nova na planilha
 * entra no schema pelo gerador e sairia daqui sem política nenhuma.
 */
describe("políticas por cargo (0015)", () => {
  const PASTA_MIGRACOES = "supabase/migrations";
  const politicas = readFileSync(join(PASTA_MIGRACOES, "0015_politicas_por_cargo.sql"), "utf8");
  const reset = readFileSync("supabase/reset-dev.sql", "utf8");

  const tabelas = [...reset.matchAll(/DROP TABLE IF EXISTS public\.(\w+)/g)].map((m) => m[1]);

  // `log` e `auditoria` são append-only de propósito: sem update, sem delete.
  const APPEND_ONLY = new Set(["log", "auditoria"]);

  it("encontrou as tabelas do schema", () => {
    // Sem isto o teste passaria vazio se o reset mudasse de formato.
    expect(tabelas.length).toBeGreaterThan(20);
  });

  /** Tabelas de um `array[...]` nomeado dentro do bloco DO. */
  const grupo = (nome) => {
    const m = politicas.match(new RegExp(`${nome} text\\[\\] := array\\[([^\\]]*)\\]`));
    return m ? [...m[1].matchAll(/'(\w+)'/g)].map((x) => x[1]) : [];
  };

  const GRUPOS = {
    encomendas: grupo("encomendas"),
    porteiro_le: grupo("porteiro_le"),
    so_administrativo: grupo("so_administrativo"),
  };

  // Estas ganham política escrita à mão, fora dos laços.
  const AVULSAS = ["assembleias", ...APPEND_ONLY];

  it("toda tabela do schema está em exatamente um grupo de acesso", () => {
    // As políticas dos grupos são montadas com `t||'_ler'`, então o nome da
    // política nunca aparece literalmente no SQL — procurar por texto não
    // funciona. O que importa conferir é que nenhuma tabela ficou de fora: sem
    // política, o RLS nega tudo, a tela mostra lista vazia e o banco não
    // reclama. Uma aba nova na planilha entra no schema pelo gerador e chegaria
    // aqui órfã.
    const cobertas = [...Object.values(GRUPOS).flat(), ...AVULSAS];

    for (const t of tabelas) {
      const em = cobertas.filter((c) => c === t);
      expect(em.length, `${t} está em ${em.length} grupos de acesso, deveria estar em 1`).toBe(1);
    }
  });

  it("os grupos não citam tabela que não existe no schema", () => {
    // Nome errado numa das listas faria o bloco DO abortar com "relation does
    // not exist", e as tabelas seguintes ficariam sem política nenhuma.
    for (const [nome, lista] of Object.entries(GRUPOS)) {
      for (const t of lista) {
        expect(tabelas, `${nome} cita ${t}, que não existe`).toContain(t);
      }
    }
  });

  it("as tabelas append-only não ganham update nem delete", () => {
    for (const t of APPEND_ONLY) {
      expect(politicas).toContain(`${t}_ler`);
      expect(politicas).toContain(`${t}_criar`);
      expect(politicas, `${t} não pode ter política de edição`).not.toContain(`${t}_editar`);
      expect(politicas, `${t} não pode ter política de exclusão`).not.toContain(`${t}_apagar`);
    }
  });

  it("nenhuma política libera geral com `using (true)`", () => {
    // `using (true)` era o padrão do 0004 e é o que deixava o porteiro ler o
    // sistema inteiro. Nenhuma política nova pode voltar a isso.
    expect(politicas).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(politicas).not.toMatch(/with check\s*\(\s*true\s*\)/i);
  });

  it("usuarios é exclusiva do desenvolvedor", () => {
    // A tabela guarda senha_hash e CPF. Se `eh_sindico` reaparecer aqui, o
    // síndico volta a ler os hashes de todo mundo.
    for (const acao of ["ler", "criar", "editar", "apagar"]) {
      const linha = politicas.match(new RegExp(`usuarios_${acao}[^;]*;`));
      expect(linha, `não achei a política usuarios_${acao}`).toBeTruthy();
      expect(linha[0]).toContain("eh_dev()");
      expect(linha[0]).not.toContain("eh_sindico()");
      expect(linha[0]).not.toContain("eh_administrativo()");
    }
  });

  it("o auxiliar não apaga: toda exclusão exige síndico", () => {
    const apagar = [...politicas.matchAll(/for delete to authenticated using \(([^)]*\))\)/g)];
    expect(apagar.length).toBeGreaterThan(0);
    for (const [, predicado] of apagar) {
      expect(predicado).not.toContain("eh_administrativo");
      expect(predicado).not.toContain("eh_auxiliar");
    }
  });

  it("o porteiro não alcança as tabelas com cpf e rg de morador", () => {
    // churrasqueira, festas, piscina e mudanças carregam dado pessoal de quem
    // reservou. O porteiro não tem essas telas e não pode ter os dados.
    //
    // `vagas` saiu desta lista no 0037, e a saída é medida, não afrouxamento:
    // ela não tem cpf nem rg — é unidade, vaga, placa, modelo e status. Estava
    // aqui por vizinhança de grupo no 0015, não por conteúdo. As quatro abaixo
    // continuam trancadas, e o teste do 0037 guarda o outro lado.
    for (const t of ["churrasqueira", "festas", "piscina", "mudancas", "compras"]) {
      const ler = politicas.match(new RegExp(`'${t}'`));
      expect(ler, `${t} sumiu da lista de tabelas`).toBeTruthy();
    }
    const grupoPorteiro = politicas.match(/porteiro_le text\[\] := array\[([^\]]*)\]/);
    expect(grupoPorteiro).toBeTruthy();
    expect(grupoPorteiro[1]).not.toMatch(/churrasqueira|festas|piscina|mudancas|compras/);
  });

  it("o 0037 dá ao porteiro ver vaga e corrigir TAG, e nada além", () => {
    // O escopo, palavra por palavra: ele VÊ a vaga e EDITA a TAG. Não cria
    // vaga, não edita vaga, não cria TAG, não apaga nada.
    //
    // Este é o teste que segura o alargamento silencioso. Um `insert` a mais
    // aqui não quebra tela nenhuma — só passa a deixar o porteiro cadastrar
    // vaga, e ninguém repara.
    const abre = readFileSync(
      join(PASTA_MIGRACOES, "0037_a_portaria_cuida_das_vagas.sql"), "utf8")
      // Normalizado: o arquivo vira CRLF ao passar pelo git no Windows, e as
      // comparações abaixo casam trechos de VÁRIAS linhas. Sem isto o teste
      // quebra por um "\r" que não tem nada a ver com o que ele afirma.
      .replace(/\r\n/g, "\n");

    // Trecho literal, e não regex: o predicado é a frase inteira que decide
    // quem entra. Escrito por extenso, um `and` no lugar do `or` — que trancaria
    // tudo — aparece aqui na hora.
    const COM_PORTEIRO = "(public.eh_administrativo() or public.eh_porteiro())";

    expect(abre, "o porteiro não enxerga a vaga")
      .toContain(`create policy vagas_ler on public.vagas\n  for select to authenticated\n  using ${COM_PORTEIRO}`);
    expect(abre, "o porteiro não enxerga a TAG")
      .toContain(`create policy tags_ler on public.tags\n  for select to authenticated\n  using ${COM_PORTEIRO}`);
    expect(abre, "o porteiro não corrige a TAG")
      .toContain(`create policy tags_editar on public.tags\n  for update to authenticated\n  using ${COM_PORTEIRO}`);

    // As três que o arquivo NÃO pode tocar. Cada uma é um passo a mais que ele
    // ganharia sem ninguém pedir.
    expect(abre, "vagas ganhou escrita").not.toMatch(/create policy vagas_criar|create policy vagas_editar/);
    expect(abre, "o porteiro passou a criar TAG").not.toMatch(/create policy tags_criar/);
    expect(abre, "o 0037 passou a mexer no apagar").not.toMatch(/for delete|_apagar/i);

    // Só as duas tabelas de veículo. Nada com dado pessoal entrou de carona.
    const tabelas = new Set([...abre.matchAll(/on public\.(\w+)/g)].map((m) => m[1]));
    expect([...tabelas].sort()).toEqual(["tags", "vagas"]);
  });

  it("a view de receita foi mesmo apagada, e nada a recria", () => {
    // Ela ignorava o RLS de churrasqueira e festas (`security_invoker = off`) e
    // o único obstáculo entre o porteiro e a receita do condomínio era um
    // `where` dentro da própria view. O 0010 já publicou essa view SEM o
    // `where` uma vez. Saiu no 0025, e a receita passou para a Edge Function.
    const dropada = readFileSync(
      join(PASTA_MIGRACOES, "0025_receita_sai_da_view.sql"), "utf8"
    );
    expect(dropada).toMatch(/drop view if exists public\.receitas_reservas/);

    // Nenhuma migration POSTERIOR ao 0025 pode trazer a view de volta — nem por
    // descuido num `create or replace` copiado de um arquivo antigo.
    const depois = readdirSync(PASTA_MIGRACOES)
      .filter((f) => f.endsWith(".sql") && Number(f.slice(0, 4)) > 25);
    for (const arquivo of depois) {
      const sql = readFileSync(join(PASTA_MIGRACOES, arquivo), "utf8");
      expect(sql, `${arquivo} recria a view de receita`)
        .not.toMatch(/create (or replace )?view public\.receitas_reservas/i);
    }
  });

  it("a Edge Function de receita autoriza por lista, e nunca devolve dado pessoal", () => {
    // É ela que substituiu a view, e ela roda com a service role — ignora RLS
    // por definição. Duas coisas precisam continuar verdadeiras: a autorização
    // é lista de permissão (negar por nome libera todo cargo que ainda não
    // existe), e a projeção é literal.
    const fonte = readFileSync("supabase/functions/receita/index.ts", "utf8");

    const colunas = fonte.match(/const COLUNAS = "([^"]*)"/);
    expect(colunas, "não achei a constante COLUNAS").toBeTruthy();
    for (const pessoal of ["morador", "cpf", "rg", "contato", "nome", "obs"]) {
      expect(colunas[1], `COLUNAS deixou passar ${pessoal}`)
        .not.toMatch(new RegExp(`\\b${pessoal}\\b`));
    }
    // `select *` traria as colunas pessoais junto sem ninguém escrever o nome
    // delas em lugar nenhum — o vazamento mais silencioso possível.
    expect(fonte).not.toMatch(/\.select\(\s*["'`]\*/);
    expect(fonte).not.toMatch(/\.select\(\s*\)/);

    // O porteiro não pode entrar na lista, e a checagem precisa vir antes de a
    // service role entrar em cena. Lê o CORPO da função, não o arquivo: o
    // comentário logo acima dela cita o porteiro justamente para explicar por
    // que ele fica de fora, e um teste que casasse com o comentário mediria a
    // prosa em vez do código.
    const corpo = fonte.match(/function podeVerReceita[\s\S]*?\n}/);
    expect(corpo, "não achei podeVerReceita").toBeTruthy();
    expect(corpo[0]).toContain('c.includes("conselheiro")');
    expect(corpo[0]).not.toMatch(/porteiro/i);
    // Lista de permissão, nunca negação: `!c.includes("porteiro")` liberaria
    // conta sem cargo e todo cargo criado no futuro.
    expect(corpo[0]).not.toMatch(/![\s(]*c\./);
    const posicaoCargo = fonte.indexOf("podeVerReceita(cargo)");
    const posicaoServiceRole = fonte.indexOf("SUPABASE_SERVICE_ROLE_KEY");
    expect(posicaoCargo).toBeGreaterThan(0);
    expect(posicaoCargo).toBeLessThan(posicaoServiceRole);
  });

  it("as funções de cargo não ficam executáveis por visitante anônimo", () => {
    // O Postgres concede EXECUTE a PUBLIC por default, e PUBLIC inclui `anon`.
    // Revogar de `anon` sem revogar de PUBLIC não revoga nada — já erramos
    // isso duas vezes.
    expect(politicas).toContain("revoke execute on function public.%I() from public");
    expect(politicas).not.toMatch(/revoke execute[^;]*from anon/i);
  });
});

describe("Edge Functions de usuário", () => {
  const arquivos = ["criar-usuario", "gerir-usuario"].map((f) =>
    readFileSync(join("supabase", "functions", f, "index.ts"), "utf8")
  );

  it("só o desenvolvedor passa", () => {
    // Estas funções rodam com a secret key, que ignora RLS por completo. Um
    // teste mais frouxo aqui que a política do banco as transformaria na porta
    // dos fundos da tabela de usuários.
    for (const fonte of arquivos) {
      expect(fonte).toContain('!== "Desenvolvedor"');
      expect(fonte).not.toMatch(/includes\(["']sindico["']\)/);
    }
  });

  it("valida o cargo de quem chama no servidor, não no corpo da requisição", () => {
    for (const fonte of arquivos) {
      // O cargo tem que sair do JWT verificado, nunca de um campo enviado pelo
      // navegador — que qualquer um edita no DevTools.
      expect(fonte).toContain("app_metadata?.cargo");
      expect(fonte).toContain("auth.getUser()");
    }
  });
});
