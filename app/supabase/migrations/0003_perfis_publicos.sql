-- Grade de perfis da tela de login.
--
-- A tela lista quem pode entrar ANTES de qualquer autenticação, então precisa
-- de uma leitura acessível ao anônimo.
--
-- O Apps Script já protegia isso com uma allow-list no backend (Código.js:391,
-- CAMPOS_PUBLICOS_USUARIOS = id, nome, email, cargo), então o senha_hash nunca
-- saía de lá. O Postgres não tem equivalente: quem pode ler a tabela lê todas
-- as colunas. Esta view recria a mesma proteção — e vai além, deixando o email
-- de fora também, já que a grade de login só precisa de nome e cargo.
create view public.perfis_publicos
with (security_invoker = off) as
  select id, nome, cargo
  from public.usuarios
  where cargo <> 'Desenvolvedor';

-- Reproduz no banco o filtro que a página já faz no cliente
-- (SelecaoUsuario.jsx:49): o perfil Desenvolvedor não aparece na grade.
grant select on public.perfis_publicos to anon, authenticated;
