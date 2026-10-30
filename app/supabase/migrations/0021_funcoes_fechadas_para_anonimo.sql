-- Fecha para o visitante anônimo TODA função do schema `public`, menos a que o
-- login precisa.
--
-- O que estava errado, e por que passou despercebido três vezes:
--
-- Eu vinha escrevendo `revoke execute ... from public` e considerando o assunto
-- resolvido, com o raciocínio "PUBLIC inclui anon, então revogar de PUBLIC
-- basta". A primeira metade é verdade. A conclusão não.
--
-- O Supabase configura `alter default privileges ... grant execute on functions
-- to anon, authenticated, service_role`. Ou seja: toda função nova nasce com um
-- privilégio DIRETO para `anon`, além do herdado de PUBLIC. Revogar de PUBLIC
-- não toca no privilégio direto — ele continua lá, sozinho, sustentando o
-- acesso. É preciso revogar dos DOIS.
--
-- Medido, não deduzido: com a chave publicável (que está no bundle e qualquer
-- um lê), um anônimo executava `eh_sindico()`, `pode_ler_anexo()`,
-- `sortear_cod_entrega()` e mais nove. Nenhuma devolvia dado de ninguém — as
-- `eh_*` respondem false sem JWT, `meu_perfil()` volta vazia —, então não houve
-- vazamento. O problema é outro: são as primitivas de que TODA política do 0015
-- e do 0017 depende. Qualquer mudança futura que faça uma delas devolver algo
-- útil passa a ser pública no mesmo instante, sem ninguém decidir isso.
--
-- Faz por laço, e não por lista: função que eu esquecesse de listar ficaria
-- aberta, e é exatamente assim que este erro se repete.

do $$
declare
  f record;
  -- A única que o anônimo precisa mesmo: o login recebe CPF ou e-mail e
  -- descobre o e-mail da conta ANTES de existir sessão. Sem ela aberta,
  -- ninguém entra no sistema. (Ela não confirma se um login existe: devolve
  -- null tanto para inexistente quanto para inativo — ver 0008.)
  aberta_ao_anonimo text[] := array['email_de_login'];
begin
  for f in
    select p.oid::regprocedure as assinatura, p.proname as nome
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
  loop
    if f.nome = any(aberta_ao_anonimo) then
      continue;
    end if;

    execute format('revoke execute on function %s from public', f.assinatura);
    execute format('revoke execute on function %s from anon', f.assinatura);
    -- `authenticated` é quem usa o sistema; garantir aqui evita que um revoke
    -- amplo derrube um cargo legítimo — foi o que quase aconteceu no 0020 com
    -- as funções de sorteio, chamadas de dentro do gatilho na sessão de quem
    -- insere.
    execute format('grant execute on function %s to authenticated', f.assinatura);
  end loop;
end $$;

-- E as que vierem depois? O padrão do projeto continua sendo o do Supabase, que
-- abre para `anon`. Esta linha muda o padrão para as PRÓXIMAS funções criadas
-- pelo dono do schema, de modo que o esquecimento deixe de ser possível.
alter default privileges in schema public revoke execute on functions from anon;
