-- Corrige o acesso à marca de senha trocada.
--
-- O 0005 criou uma policy de UPDATE para a própria linha, mas ela não funciona:
-- o Postgres exige permissão de SELECT para resolver o `where id = ...` da
-- própria UPDATE, e usuarios_ler é só para síndico. Resultado observado: o
-- Porteiro recebia sucesso e nenhuma linha era alterada — falha silenciosa.
--
-- Liberar SELECT da própria linha resolveria, mas entregaria o senha_hash da
-- pessoa para ela mesma: RLS é por linha, não por coluna, então não dá para
-- expor só senha_trocada. Duas funções security definer resolvem sem abrir a
-- tabela para ninguém.

drop policy if exists usuarios_marcar_propria_senha on public.usuarios;

-- `security definer` roda com os privilégios do dono, ignorando RLS. O id vem
-- do JWT, não de parâmetro — o usuário não consegue apontar para outra linha.
-- `set search_path` é obrigatório aqui: sem ele, um schema malicioso no
-- search_path do chamador poderia sequestrar a resolução dos nomes.
create or replace function public.senha_ja_trocada()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select senha_trocada from public.usuarios
      where id = (auth.jwt() -> 'app_metadata' ->> 'usuario_id')::bigint),
    false
  );
$$;

create or replace function public.marcar_senha_trocada()
returns void
language sql
security definer
set search_path = public
as $$
  update public.usuarios
     set senha_trocada = true
   where id = (auth.jwt() -> 'app_metadata' ->> 'usuario_id')::bigint;
$$;

-- Só quem está autenticado. O anônimo não tem usuario_id no token e não teria
-- o que marcar, mas negar explicitamente é mais barato que confiar nisso.
revoke execute on function public.senha_ja_trocada()   from anon;
revoke execute on function public.marcar_senha_trocada() from anon;
grant  execute on function public.senha_ja_trocada()   to authenticated;
grant  execute on function public.marcar_senha_trocada() to authenticated;
