-- Login aceitando CPF ou e-mail.
--
-- O Supabase Auth autentica por e-mail, então um login por CPF precisa
-- converter CPF em e-mail ANTES de autenticar — e essa conversão acontece
-- necessariamente antes de existir sessão, ou seja, para o anônimo.
--
-- Isso é um oráculo: quem souber um CPF descobre o e-mail correspondente. O
-- trade-off é aceito porque hoje é pior — a aba `usuarios` do Apps Script é
-- isenta de sessão e entrega os 5 e-mails para qualquer um de posse do token,
-- que vai público no bundle. Exigir o CPF certo é estritamente mais fechado do
-- que a lista aberta. Quando o Apps Script morrer (fase 2), vale reavaliar
-- trocando por uma Edge Function que autentica no servidor e não devolve nada.

-- Só dígitos. A planilha grava CPF em formatos diferentes ("111.222.333-44",
-- "12345678909") e o usuário digita de qualquer jeito — normalizar na gravação
-- e na consulta evita comparar máscara com máscara.
alter table public.usuarios add column cpf text;

create unique index usuarios_cpf_unico on public.usuarios (cpf) where cpf is not null;

comment on column public.usuarios.cpf is
  'Somente dígitos, sem pontuação. Usado como identificador alternativo no login.';

-- Recebe CPF (com ou sem máscara) ou e-mail e devolve o e-mail da conta.
-- security definer porque `usuarios` é fechada: só o síndico a lê, e esta
-- consulta precisa acontecer antes de qualquer autenticação.
create or replace function public.email_de_login(identificador text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select u.email
    from public.usuarios u
   where lower(u.email) = lower(trim(identificador))
      or (u.cpf is not null
          and u.cpf = regexp_replace(coalesce(identificador, ''), '\D', '', 'g')
          and length(regexp_replace(coalesce(identificador, ''), '\D', '', 'g')) = 11)
   limit 1;
$$;

-- EXECUTE em função vai para PUBLIC por padrão; revogar de `anon` sozinho não
-- remove nada. Revoga de PUBLIC e concede explicitamente — inclusive a anon,
-- que é quem precisa: a conversão acontece na tela de login, sem sessão.
revoke execute on function public.email_de_login(text) from public;
grant  execute on function public.email_de_login(text) to anon, authenticated;
