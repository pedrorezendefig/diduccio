-- Políticas de RLS por cargo. SUBSTITUI o 0004 e o 0010 por inteiro.
--
-- O modelo, decidido pelo Lucas:
--
--   Desenvolvedor  tudo, inclusive usuários
--   Síndico        tudo menos usuários — cria, edita e exclui
--   Auxiliar       tudo menos usuários — cria e edita, NÃO exclui
--   Porteiro       lê moradores, unidades e confirmação;
--                  lê e escreve o módulo de encomendas
--   Conselheiro    só leitura, e só de assembleias e dos números do gráfico
--
-- Por que o auxiliar não exclui: apagar reserva paga ou registro de entrega é
-- onde mora o prejuízo, e é irreversível. Criar e editar cobre o trabalho do
-- dia a dia; o estrago fica com quem responde pelo condomínio.
--
-- Por que o porteiro lê `confirmacao`: a tela de Encomendas precisa saber se o
-- número do morador está confirmado antes de notificar por WhatsApp. Não abre
-- nada novo — nome e telefone ele já enxerga em `moradores`.
--
-- Esconder o card na tela NÃO substitui isto: com o próprio token, qualquer
-- usuário consulta a API direto pelo DevTools. Quem nega é o banco; a tela só
-- reflete o que já está negado.
--
-- Pode ser rodado quantas vezes for preciso: apaga todas as políticas de
-- `public` antes de recriar.

-- ---------------------------------------------------------------------------
-- Identidade
-- ---------------------------------------------------------------------------

-- Lê o cargo do app_metadata do JWT. Usar app_metadata e NÃO user_metadata é
-- essencial: o primeiro só é escrito pela secret key, o segundo o próprio
-- usuário consegue editar. Um usuário capaz de se promover a síndico anularia
-- todas as políticas abaixo.
create or replace function public.cargo_atual()
returns text language sql stable
set search_path = public as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'cargo', '');
$$;

-- Compara sem acento de propósito. O cargo gravado é "Sindico", sem acento,
-- mas o app escreve "Síndico" com acento em outros lugares. Um like '%síndico%'
-- não casaria com "Sindico", e o síndico entraria no sistema sem conseguir
-- escrever nada — falha silenciosa, porque o login funcionaria normalmente.
create or replace function public.cargo_sem_acento()
returns text language sql stable
set search_path = public as $$
  select translate(lower(public.cargo_atual()),
                   'áàâãéèêíìîóòôõúùûç',
                   'aaaaeeeiiioooouuuc');
$$;

create or replace function public.eh_dev()
returns boolean language sql stable
set search_path = public as $$
  select public.cargo_atual() = 'Desenvolvedor';
$$;

-- Inclui o dev de propósito: onde o síndico pode, o dev também pode.
create or replace function public.eh_sindico()
returns boolean language sql stable
set search_path = public as $$
  select public.eh_dev() or public.cargo_sem_acento() like '%sindico%';
$$;

create or replace function public.eh_auxiliar()
returns boolean language sql stable
set search_path = public as $$
  select public.cargo_sem_acento() like '%auxiliar%';
$$;

-- Quem toca a administração: dev, síndico e auxiliar. É o predicado de leitura
-- e de escrita da maior parte do sistema.
create or replace function public.eh_administrativo()
returns boolean language sql stable
set search_path = public as $$
  select public.eh_sindico() or public.eh_auxiliar();
$$;

create or replace function public.eh_porteiro()
returns boolean language sql stable
set search_path = public as $$
  select public.cargo_sem_acento() like '%porteiro%';
$$;

create or replace function public.eh_conselheiro()
returns boolean language sql stable
set search_path = public as $$
  select public.cargo_sem_acento() like '%conselheiro%';
$$;

-- O Postgres concede EXECUTE a PUBLIC por default em toda função nova, e
-- PUBLIC inclui `anon` — o visitante não autenticado. Revogar de `anon` sem
-- revogar de PUBLIC não revoga nada: já erramos isso duas vezes.
do $$
declare f text;
begin
  foreach f in array array[
    'cargo_atual', 'cargo_sem_acento', 'eh_dev', 'eh_sindico',
    'eh_auxiliar', 'eh_administrativo', 'eh_porteiro', 'eh_conselheiro'
  ] loop
    execute format('revoke execute on function public.%I() from public', f);
    execute format('grant  execute on function public.%I() to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Limpa tudo que veio antes
-- ---------------------------------------------------------------------------

-- Sem isto, rodar de novo falharia com "policy already exists" na primeira
-- tabela, deixando as demais com a política antiga — meio caminho, que é o
-- pior estado possível para um controle de acesso.
do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- As tabelas, por grupo de acesso
-- ---------------------------------------------------------------------------

do $$
declare
  t text;

  -- Módulo de encomendas: o trabalho do porteiro. Ele lê e escreve.
  encomendas text[] := array[
    'entregas', 'entregas_foto', 'entregas_nf', 'entregas_recebimento',
    'entregadores', 'entregadores_chegadas'
  ];

  -- O porteiro lê para atender na portaria, mas não altera cadastro.
  porteiro_le text[] := array['moradores', 'unidades', 'confirmacao'];

  -- Administração apenas. O porteiro não enxerga: churrasqueira, festas,
  -- piscina e mudanças carregam cpf, rg e contato de quem reservou.
  so_administrativo text[] := array[
    'agendamentos', 'assinatura', 'churrasqueira', 'compras',
    'compras_produtos', 'festas', 'multas', 'mudancas', 'notas', 'piscina',
    'tags', 'uploads_churrasqueira', 'uploads_compras', 'uploads_festas',
    'uploads_piscina', 'vagas'
  ];
begin
  -- Encomendas: administrativo e porteiro leem e escrevem; só síndico apaga.
  foreach t in array encomendas loop
    execute format('create policy %I on public.%I for select to authenticated using (public.eh_administrativo() or public.eh_porteiro())', t||'_ler', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.eh_administrativo() or public.eh_porteiro())', t||'_criar', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.eh_administrativo() or public.eh_porteiro())', t||'_editar', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.eh_sindico())', t||'_apagar', t);
  end loop;

  -- Porteiro lê, administrativo escreve.
  foreach t in array porteiro_le loop
    execute format('create policy %I on public.%I for select to authenticated using (public.eh_administrativo() or public.eh_porteiro())', t||'_ler', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.eh_administrativo())', t||'_criar', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.eh_administrativo())', t||'_editar', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.eh_sindico())', t||'_apagar', t);
  end loop;

  -- Só administração, ponto.
  foreach t in array so_administrativo loop
    execute format('create policy %I on public.%I for select to authenticated using (public.eh_administrativo())', t||'_ler', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.eh_administrativo())', t||'_criar', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.eh_administrativo())', t||'_editar', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.eh_sindico())', t||'_apagar', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- assembleias: a exceção do conselheiro
-- ---------------------------------------------------------------------------

create policy assembleias_ler on public.assembleias
  for select to authenticated using (public.eh_administrativo() or public.eh_conselheiro());
create policy assembleias_criar on public.assembleias
  for insert to authenticated with check (public.eh_administrativo());
create policy assembleias_editar on public.assembleias
  for update to authenticated using (public.eh_administrativo());
create policy assembleias_apagar on public.assembleias
  for delete to authenticated using (public.eh_sindico());

-- ---------------------------------------------------------------------------
-- usuarios: só o desenvolvedor
-- ---------------------------------------------------------------------------

-- A tabela guarda senha_hash e o CPF de quem trabalha aqui. A tela de Usuários
-- já era exclusiva do dev na barra lateral (Sidebar.jsx); a política é que
-- estava mais aberta que a tela, liberando o síndico. Agora as duas concordam.
create policy usuarios_ler    on public.usuarios for select to authenticated using (public.eh_dev());
create policy usuarios_criar  on public.usuarios for insert to authenticated with check (public.eh_dev());
create policy usuarios_editar on public.usuarios for update to authenticated using (public.eh_dev());
create policy usuarios_apagar on public.usuarios for delete to authenticated using (public.eh_dev());

-- ---------------------------------------------------------------------------
-- Auditoria: append-only
-- ---------------------------------------------------------------------------

-- Sem política de update nem de delete, de propósito: registro de auditoria que
-- pode ser editado não serve como auditoria. Nem o dev altera.
--
-- Inserir é liberado a todo cargo que age, porque o log é escrito junto com a
-- ação — se o porteiro não pudesse inserir, dar baixa numa encomenda falharia
-- pela metade. O conselheiro fica de fora: ele não age, só lê.
--
-- Lista de permissão, e não `not eh_conselheiro()`. A diferença importa: a
-- negação libera todo cargo que ela não conhece — conta sem `cargo` no
-- app_metadata, cargo com erro de digitação, cargo novo criado no futuro. E o
-- estrago é justamente na tabela que serve para saber quem fez o quê: registro
-- de auditoria que qualquer um escreve não serve como auditoria.
create policy log_ler   on public.log for select to authenticated using (public.eh_administrativo());
create policy log_criar on public.log for insert to authenticated
  with check (public.eh_administrativo() or public.eh_porteiro());

create policy auditoria_ler   on public.auditoria for select to authenticated using (public.eh_sindico());
create policy auditoria_criar on public.auditoria for insert to authenticated
  with check (public.eh_administrativo() or public.eh_porteiro());

-- ---------------------------------------------------------------------------
-- Os números do Dashboard, sem dado pessoal
-- ---------------------------------------------------------------------------

-- O gráfico de receita soma `valor_taxa` das reservas pagas, e essas linhas
-- carregam cpf, rg, contato e nome de morador. Esta view expõe só o que o
-- gráfico precisa, para o conselheiro ver os valores sem enxergar quem reservou.
--
-- O WHERE não é decoração: a view roda com `security_invoker = off`, ou seja,
-- ignora o RLS das tabelas de origem. Sem ele, o porteiro leria a receita do
-- condomínio inteiro consultando a view direto pela API.
create or replace view public.receitas_reservas
with (security_invoker = off) as
  select data_reserva, valor_taxa, pago, 'churrasqueira'::text as origem
    from public.churrasqueira
   where public.eh_administrativo() or public.eh_conselheiro()
  union all
  select data_reserva, valor_taxa, pago, 'festas'::text
    from public.festas
   where public.eh_administrativo() or public.eh_conselheiro();

revoke all on public.receitas_reservas from public;
grant select on public.receitas_reservas to authenticated;
