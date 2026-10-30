-- O nome de quem está logado, e o fim da view que sobrou da grade de login.
--
-- Duas coisas relacionadas: uma abre o mínimo necessário, a outra fecha o que
-- deixou de ser necessário.

-- ---------------------------------------------------------------------------
-- meu_perfil(): nome e cargo de quem está com o token na mão
-- ---------------------------------------------------------------------------

-- `usuarios` é só do dev desde o 0015, e com razão: guarda senha_hash e CPF.
-- Mas o app precisa do NOME de quem entrou — para a saudação do painel, para a
-- inicial no canto da sidebar e para filtrar o log pelas ações da própria
-- pessoa. Sem isto o `entrar` devolvia só id, e-mail e cargo, e o Dashboard,
-- que só busca dados quando há nome, não carregava nada.
--
-- security definer com o id tirado do PRÓPRIO JWT: ninguém consulta o perfil de
-- outra pessoa passando um id. E devolve só três colunas — senha_hash e cpf
-- ficam de fora, porque RLS é por linha e não por coluna: liberar a linha
-- inteira entregaria o hash junto.
create or replace function public.meu_perfil()
returns table (id bigint, nome text, cargo text)
language sql
security definer
set search_path = public
stable
as $$
  select u.id, u.nome, u.cargo
    from public.usuarios u
   where u.id = (auth.jwt() -> 'app_metadata' ->> 'usuario_id')::bigint;
$$;

-- O Postgres concede EXECUTE a PUBLIC por default, e PUBLIC inclui `anon`.
-- Revogar de `anon` sem revogar de PUBLIC não revoga nada — já erramos isso
-- duas vezes neste projeto.
revoke execute on function public.meu_perfil() from public;
grant  execute on function public.meu_perfil() to authenticated;

-- ---------------------------------------------------------------------------
-- Fim da perfis_publicos
-- ---------------------------------------------------------------------------

-- Ela existia para a grade de perfis da tela de login, que mostrava quem podia
-- entrar ANTES de qualquer autenticação — por isso o `grant select to anon`.
--
-- A grade não existe mais: o login virou formulário de e-mail ou CPF mais
-- senha. O que sobrou foi uma view que entrega nome e cargo de todos os
-- funcionários a qualquer visitante não autenticado, sem nada em troca.
-- Verificado antes de derrubar: nenhuma referência em src/ nem nas Edge
-- Functions.
drop view if exists public.perfis_publicos;
