-- Quem pode receber uma tarefa: os nomes da administração, só para a administração.
--
-- O campo Responsável do quadro de tarefas (0042) precisa de id, nome e cargo
-- do síndico e do auxiliar. A primeira versão da tela lia `perfis_publicos` —
-- a view que o 0016 derrubou porque entregava nome e cargo de TODOS os
-- funcionários a qualquer visitante não autenticado. Em produção o `listar`
-- estourava com "relation does not exist" e o quadro não abria para ninguém.
--
-- A view NÃO volta. E ler `usuarios` direto também não serve: ela é fechada
-- desde o 0015 (guarda senha_hash e CPF), e o auxiliar não a enxerga — nem
-- deve, porque RLS é por linha e não por coluna: abrir a linha entregaria o
-- hash junto.
--
-- Então uma função `security definer`, estreita nas três direções:
--   * colunas: id, nome e cargo — nada de e-mail, CPF ou hash;
--   * linhas:  só síndico e auxiliar, os únicos cargos que recebem tarefa;
--   * quem:    só a administração (`eh_administrativo()`); para qualquer outro
--              autenticado a função devolve zero linhas, como o RLS faria.
--
-- O 0024 apagou uma função assim (`meu_perfil`) por não ter mais uso: função
-- com privilégio elevado e sem chamador é só superfície. Esta tem chamador —
-- `listarResponsaveis` no src/api/db.js, usado pela tela de Tarefas. Se a tela
-- deixar de usá-la, ela sai junto.
--
-- DEPENDE DO 0015 (eh_administrativo).

create or replace function public.responsaveis_de_tarefa()
returns table (id bigint, nome text, cargo text)
language sql
security definer
set search_path = public
stable
as $$
  select u.id, u.nome, u.cargo
    from public.usuarios u
   where u.cargo in ('Sindico', 'Auxiliar Administrativo')
     and public.eh_administrativo()
   order by u.nome;
$$;

-- O Postgres concede EXECUTE a PUBLIC por default, e PUBLIC inclui `anon`.
-- Revogar de `anon` sem revogar de PUBLIC não revoga nada — já erramos isso
-- duas vezes neste projeto. O de `anon` fica explícito mesmo assim: o 0021
-- tirou o default de anon, mas quem lê esta migração não precisa saber disso.
revoke execute on function public.responsaveis_de_tarefa() from public;
revoke execute on function public.responsaveis_de_tarefa() from anon;
grant execute on function public.responsaveis_de_tarefa() to authenticated;
